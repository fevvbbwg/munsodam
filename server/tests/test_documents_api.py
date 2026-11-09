import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from server.app import auth
from server.app import main as api
from server.app.database import Base


class DocumentApiIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.storage = self.root / "uploads"
        self.storage.mkdir()
        self.engine = create_engine(
            f"sqlite:///{self.root / 'documents.sqlite'}",
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _record):
            connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

        self.patched_values = [
            patch.object(api, "engine", self.engine),
            patch.object(api, "SessionLocal", self.session_factory),
            patch.object(auth, "SessionLocal", self.session_factory),
            patch.object(api.settings, "storage_dir", self.storage),
            patch.object(api.settings, "chunk_chars", 24),
            patch.object(api.settings, "chunk_overlap", 4),
            patch.object(api, "initialize_database", lambda: None),
            patch.object(api, "index_document", self._mark_indexed),
        ]
        for patched in self.patched_values:
            patched.start()
        self.client = TestClient(api.app)
        response = self.client.post("/api/auth/register", json={
            "display_name": "Test User",
            "email": f"test-{uuid.uuid4()}@example.invalid",
            "password": "local-test-password-1",
        })
        if response.status_code != 201:
            raise AssertionError(f"Test account setup failed: {response.status_code} {response.text}")

    def tearDown(self):
        self.client.close()
        for patched in reversed(self.patched_values):
            patched.stop()
        self.engine.dispose()
        self.temporary_directory.cleanup()

    @staticmethod
    def _mark_indexed(document, db):
        document.index_status = "ready"
        db.commit()
        db.refresh(document)

    def upload(self, filename="policy.txt", content=b"# Travel\nKeep the receipt."):
        return self.client.post(
            "/api/documents",
            files={"file": (filename, content, "text/plain")},
        )

    def test_upload_list_detail_download_and_delete_stay_in_isolated_storage(self):
        content = b"# Travel\nKeep the receipt.\nSubmit after returning."

        uploaded = self.upload(content=content)

        self.assertEqual(uploaded.status_code, 201)
        document = uploaded.json()
        self.assertEqual(document["filename"], "policy.txt")
        self.assertEqual(document["status"], "completed")
        self.assertEqual(document["index_status"], "ready")
        self.assertGreaterEqual(document["chunk_count"], 1)
        self.assertEqual(len(list(self.storage.iterdir())), 1)

        listed = self.client.get("/api/documents")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["id"] for item in listed.json()], [document["id"]])

        detail = self.client.get(f"/api/documents/{document['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["chunk_count"], document["chunk_count"])
        self.assertIn("Keep the receipt.", " ".join(chunk["content"] for chunk in detail.json()["chunks"]))

        downloaded = self.client.get(f"/api/documents/{document['id']}/file")
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded.content, content)

        deleted = self.client.delete(f"/api/documents/{document['id']}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get("/api/documents").json(), [])
        self.assertEqual(list(self.storage.iterdir()), [])

    def test_duplicate_upload_is_rejected_without_creating_a_second_file(self):
        content = b"# Travel\nKeep the receipt."
        first = self.upload(content=content)

        duplicate = self.upload(filename="renamed.txt", content=content)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["document_id"], first.json()["id"])
        self.assertEqual(duplicate.json()["filename"], first.json()["filename"])
        self.assertEqual(len(self.client.get("/api/documents").json()), 1)
        self.assertEqual(len(list(self.storage.iterdir())), 1)

    def test_upload_strips_windows_path_from_client_filename(self):
        uploaded = self.upload(filename=r"C:\private\travel.txt")

        self.assertEqual(uploaded.status_code, 201)
        self.assertEqual(uploaded.json()["filename"], "travel.txt")
        stored_files = list(self.storage.iterdir())
        self.assertEqual(len(stored_files), 1)
        self.assertEqual(stored_files[0].parent, self.storage)

    def test_upload_rejects_unsupported_and_empty_files_without_storing_them(self):
        unsupported = self.upload(filename="policy.exe", content=b"not a document")
        empty = self.upload(filename="empty.txt", content=b"")

        self.assertEqual(unsupported.status_code, 415)
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(self.client.get("/api/documents").json(), [])
        self.assertEqual(list(self.storage.iterdir()), [])

    def test_failed_extraction_can_be_retried_from_the_stored_original(self):
        real_extract_text = api.extract_text
        with patch.object(api, "extract_text", side_effect=ValueError("temporary parser error")):
            failed = self.upload(content=b"# Travel\nKeep the receipt.").json()

        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["chunk_count"], 0)
        self.assertEqual(len(list(self.storage.iterdir())), 1)

        with patch.object(api, "extract_text", side_effect=real_extract_text):
            retried = self.client.post(f"/api/documents/{failed['id']}/extract")

        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.json()["status"], "completed")
        self.assertEqual(retried.json()["index_status"], "ready")
        self.assertGreater(retried.json()["chunk_count"], 0)
        self.assertIsNone(retried.json()["error_message"])
        self.assertEqual(len(list(self.storage.iterdir())), 1)

    def test_extraction_retry_rejects_documents_that_are_not_failed(self):
        document = self.upload().json()

        response = self.client.post(f"/api/documents/{document['id']}/extract")

        self.assertEqual(response.status_code, 409)

    def test_search_scope_limits_results_to_the_selected_document(self):
        first = self.upload(
            filename="travel.txt",
            content=b"# Travel\nOrbit receipts are required for taxi reimbursement.",
        ).json()
        second = self.upload(
            filename="leave.txt",
            content=b"# Leave\nLuna requests need manager approval.",
        ).json()

        scoped = self.client.post("/api/search", json={
            "query": "orbit",
            "mode": "keyword",
            "document_id": second["id"],
        })
        unscoped = self.client.post("/api/search", json={
            "query": "orbit",
            "mode": "keyword",
        })

        self.assertEqual(scoped.status_code, 200)
        self.assertEqual(scoped.json()["results"], [])
        self.assertEqual(unscoped.status_code, 200)
        self.assertEqual({item["document_id"] for item in unscoped.json()["results"]}, {first["id"]})

    def test_document_text_search_pages_through_ranked_matches(self):
        content = "\n".join(f"needle evidence record {index:02d}." for index in range(30)).encode()
        document = self.upload(filename="many-matches.txt", content=content).json()

        first_page = self.client.get(f"/api/documents/{document['id']}/search", params={"q": "needle", "limit": 10})
        second_page = self.client.get(f"/api/documents/{document['id']}/search", params={"q": "needle", "offset": 10, "limit": 10})

        self.assertEqual(first_page.status_code, 200)
        self.assertEqual(second_page.status_code, 200)
        self.assertGreater(first_page.json()["total"], 10)
        self.assertEqual(first_page.json()["offset"], 0)
        self.assertEqual(second_page.json()["offset"], 10)
        self.assertEqual(len(first_page.json()["results"]), 10)
        self.assertGreater(len(second_page.json()["results"]), 0)
        self.assertTrue({item["chunk_id"] for item in first_page.json()["results"]}.isdisjoint(
            item["chunk_id"] for item in second_page.json()["results"]
        ))

    def test_search_scope_reports_a_deleted_document(self):
        response = self.client.post("/api/search", json={
            "query": "policy",
            "mode": "keyword",
            "document_id": str(uuid.uuid4()),
        })

        self.assertEqual(response.status_code, 404)
        self.assertIn("선택한 문서를 찾을 수 없습니다", response.json()["detail"])

    def test_document_outline_pages_sections_in_source_order(self):
        document = self.upload(
            filename="outline.txt",
            content=b"# Travel\nKeep the receipt.\n# Meals\nSave the itemized bill.\n# Taxi\nRecord the destination.",
        ).json()

        first_page = self.client.get(f"/api/documents/{document['id']}/outline?limit=1&offset=0")
        second_page = self.client.get(f"/api/documents/{document['id']}/outline?limit=1&offset=1")
        last_page = self.client.get(f"/api/documents/{document['id']}/outline?limit=1&offset=2")

        self.assertEqual(first_page.status_code, 200)
        self.assertTrue(first_page.json()["preview"].startswith("Keep the receipt."))
        self.assertLessEqual(len(first_page.json()["preview"]), 240)
        self.assertEqual([section["title"] for section in first_page.json()["sections"]], ["Travel"])
        self.assertEqual(first_page.json()["more_sections"], 2)
        self.assertEqual([section["title"] for section in second_page.json()["sections"]], ["Meals"])
        self.assertEqual(second_page.json()["more_sections"], 1)
        self.assertEqual([section["title"] for section in last_page.json()["sections"]], ["Taxi"])
        self.assertEqual(last_page.json()["more_sections"], 0)


if __name__ == "__main__":
    unittest.main()
