import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.app import auth
from server.app import main as api
from server.app.database import Base
from server.app.models import Document


class AuthApiIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.storage = self.root / "uploads"
        self.storage.mkdir()
        database_path = self.root / "auth.sqlite"
        self.engine = create_engine(
            f"sqlite:///{database_path}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        self.patched_values = [
            patch.object(api, "engine", self.engine),
            patch.object(api, "SessionLocal", self.session_factory),
            patch.object(auth, "SessionLocal", self.session_factory),
            patch.object(api.settings, "storage_dir", self.storage),
            patch.object(api, "initialize_database", lambda: None),
            patch.object(api.settings, "auth_cookie_secure", False),
            patch.object(api.settings, "app_origin", "http://127.0.0.1:5175"),
            patch.object(api.settings, "smtp_host", "smtp.example.invalid"),
            patch.object(api.settings, "smtp_from", "no-reply@example.invalid"),
        ]
        for patched in self.patched_values:
            patched.start()
        with api._auth_rate_lock:
            api._failed_login_attempts.clear()
            api._password_reset_attempts.clear()
        self.client = TestClient(api.app)
        self.email = f"auth-{uuid.uuid4()}@example.invalid"
        self.password = "local-test-password-123"

    def tearDown(self):
        self.client.close()
        for patched in reversed(self.patched_values):
            patched.stop()
        self.engine.dispose()
        self.temporary_directory.cleanup()

    def register(self):
        response = self.client.post("/api/auth/register", json={
            "display_name": "Test User",
            "email": self.email,
            "password": self.password,
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response

    def test_register_login_me_and_logout_round_trip(self):
        registered = self.register()
        self.assertEqual(registered.json()["email"], self.email)
        self.assertEqual(registered.json()["auth_method"], "email")
        session_cookie = self.client.cookies.get(auth.SESSION_COOKIE)
        self.assertTrue(session_cookie)

        current = self.client.get("/api/auth/me")
        self.assertEqual(current.status_code, 200)
        self.assertEqual(current.json()["id"], registered.json()["id"])

        rejected = self.client.post("/api/auth/login", json={
            "email": self.email,
            "password": "wrong-password-123",
        })
        self.assertEqual(rejected.status_code, 401)

        logged_out = self.client.post("/api/auth/logout")
        self.assertEqual(logged_out.status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

        logged_in = self.client.post("/api/auth/login", json={
            "email": self.email.upper(),
            "password": self.password,
        })
        self.assertEqual(logged_in.status_code, 200, logged_in.text)
        self.assertEqual(logged_in.json()["id"], registered.json()["id"])
        self.assertNotEqual(self.client.cookies.get(auth.SESSION_COOKIE), session_cookie)

    def test_duplicate_email_is_rejected_case_insensitively(self):
        self.register()
        duplicate = self.client.post("/api/auth/register", json={
            "display_name": "Another User",
            "email": self.email.upper(),
            "password": self.password,
        })
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

    def test_first_account_claims_existing_documents_and_keeps_them_private(self):
        with self.session_factory() as db:
            legacy_document = Document(
                filename="existing-policy.txt",
                storage_path=str(self.storage / "existing-policy.txt"),
                file_type="txt",
                status="completed",
                index_status="ready",
                sha256="a" * 64,
            )
            db.add(legacy_document)
            db.commit()
            document_id = str(legacy_document.id)

        self.register()
        first_account_documents = self.client.get("/api/documents")
        self.assertEqual(first_account_documents.status_code, 200, first_account_documents.text)
        self.assertEqual([item["id"] for item in first_account_documents.json()], [document_id])

        second_account = self.client.post("/api/auth/register", json={
            "display_name": "Another User",
            "email": f"second-{uuid.uuid4()}@example.invalid",
            "password": self.password,
        })
        self.assertEqual(second_account.status_code, 201, second_account.text)
        self.assertEqual(self.client.get("/api/documents").json(), [])

    def test_recovery_code_finds_id_and_resets_password_once(self):
        self.register()
        issued = self.client.post("/api/auth/recovery-code")
        self.assertEqual(issued.status_code, 200, issued.text)
        code = issued.json()["recovery_code"]

        self.client.post("/api/auth/logout")
        found = self.client.post("/api/auth/id-recovery", json={"recovery_code": code})
        self.assertEqual(found.status_code, 200, found.text)
        self.assertEqual(found.json()["email"], self.email)

        new_password = "local-new-password-456"
        reset = self.client.post("/api/auth/password-reset/recovery", json={
            "email": self.email,
            "recovery_code": code,
            "new_password": new_password,
        })
        self.assertEqual(reset.status_code, 200, reset.text)
        self.assertEqual(self.client.post("/api/auth/id-recovery", json={"recovery_code": code}).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/login", json={
            "email": self.email,
            "password": self.password,
        }).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={
            "email": self.email,
            "password": new_password,
        }).status_code, 200)

    def test_email_reset_link_is_single_use_and_revokes_sessions(self):
        self.register()
        sent_messages = []
        with patch.object(api, "smtp_send_password_reset", side_effect=lambda recipient, link: sent_messages.append((recipient, link))):
            requested = self.client.post("/api/auth/password-reset/request", json={"email": self.email})
        self.assertEqual(requested.status_code, 202, requested.text)
        self.assertEqual(len(sent_messages), 1)
        self.assertEqual(sent_messages[0][0], self.email)
        self.assertIn("http://127.0.0.1:5175/reset-password?token=", sent_messages[0][1])

        token = sent_messages[0][1].split("token=", 1)[1]
        changed = self.client.post("/api/auth/password-reset/confirm", json={
            "token": token,
            "password": "local-email-reset-789",
        })
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        replay = self.client.post("/api/auth/password-reset/confirm", json={
            "token": token,
            "password": "local-email-reset-789",
        })
        self.assertEqual(replay.status_code, 400)
        logged_in = self.client.post("/api/auth/login", json={
            "email": self.email,
            "password": "local-email-reset-789",
        })
        self.assertEqual(logged_in.status_code, 200, logged_in.text)

    def test_kakao_login_returns_to_same_origin_document_path_after_callback(self):
        return_path = "/documents/123?view=content#chunk-7"
        redirect_uri = "http://127.0.0.1:5175/api/auth/kakao/callback"
        with patch.object(api.settings, "kakao_client_id", "local-test-kakao-key"), \
                patch.object(api.settings, "kakao_client_secret", "local-test-kakao-secret"), \
                patch.object(api.settings, "kakao_redirect_uri", redirect_uri):
            started = self.client.get("/api/auth/kakao", params={"next": return_path}, follow_redirects=False)
            self.assertEqual(started.status_code, 307)
            oauth_query = parse_qs(urlsplit(started.headers["location"]).query)
            state = oauth_query["state"][0]
            self.assertEqual(oauth_query["redirect_uri"], [redirect_uri])
            self.assertEqual(self.client.cookies.get("munsodam_oauth_return").strip('"'), return_path)

            token_response = Mock()
            token_response.json.return_value = {"access_token": "local-test-access-token"}
            profile_response = Mock()
            profile_response.json.return_value = {
                "id": 938475,
                "kakao_account": {
                    "is_email_verified": True,
                    "email": "kakao-user@example.invalid",
                    "profile": {"nickname": "Kakao User"},
                },
            }
            with patch.object(api.httpx, "post", return_value=token_response) as token_request, \
                    patch.object(api.httpx, "get", return_value=profile_response):
                callback = self.client.get(
                    "/api/auth/kakao/callback",
                    params={"code": "local-test-code", "state": state},
                    follow_redirects=False,
                )

        self.assertEqual(callback.status_code, 303)
        self.assertEqual(callback.headers["location"], return_path)
        self.assertIn("munsodam_session", callback.headers.get("set-cookie", ""))
        token_request.assert_called_once()
        self.assertEqual(token_request.call_args.kwargs["data"]["redirect_uri"], redirect_uri)
        self.assertEqual(self.client.get("/api/auth/me").json()["auth_method"], "kakao")

    def test_kakao_login_rejects_external_return_targets(self):
        with patch.object(api.settings, "kakao_client_id", "local-test-kakao-key"):
            response = self.client.get(
                "/api/auth/kakao",
                params={"next": "https://attacker.invalid/collect"},
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 307)
        self.assertEqual(self.client.cookies.get("munsodam_oauth_return").strip('"'), "/")


if __name__ == "__main__":
    unittest.main()
