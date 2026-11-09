"""Run the local-model evaluation suite through the FastAPI service."""

import argparse
import hashlib
import http.cookiejar
import json
import os
import re
import secrets
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
GOLD = ROOT / "gold_questions.json"
DEV = ROOT / "dev_questions.json"
CHAT_MODEL = "qwen3:4b-instruct"
EMBEDDING_MODEL = "embeddinggemma"
OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
)


def request_json(url: str, payload=None, timeout=240):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"} if body is not None else {}
    request = urllib.request.Request(url, data=body, headers=headers)
    try:
        with OPENER.open(request, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"API에 연결할 수 없습니다 ({url}): {exc.reason}") from exc


def upload_document(base_url: str, filename: str, data: bytes):
    boundary = "----CodexEvaluationBoundary7MA4YWxkTrZu0gW"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: text/plain; charset=utf-8\r\n\r\n"
    ).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode("ascii")
    request = urllib.request.Request(
        f"{base_url}/api/documents",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with OPENER.open(request, timeout=240) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"문서 업로드 실패 ({filename}): HTTP {exc.code} {exc.read().decode('utf-8', errors='replace')}") from exc


def ensure_fixture_documents(base_url: str) -> dict[str, str]:
    fixtures = {path.name: path.read_bytes() for path in sorted(DOCS.glob("*.txt"))}
    if not fixtures:
        raise RuntimeError("평가할 가상 문서를 찾을 수 없습니다.")
    documents = request_json(f"{base_url}/api/documents")
    by_name = {document["filename"]: document for document in documents}
    if len(by_name) != len(documents) or by_name.keys() - fixtures.keys():
        raise RuntimeError("평가 자료 외의 문서가 있는 계정입니다. --isolated 또는 별도 평가 계정을 사용하세요.")

    # Verify the whole corpus before uploading anything to a connected account.
    for filename, document in by_name.items():
        expected = fixtures[filename]
        with OPENER.open(f"{base_url}/api/documents/{document['id']}/file", timeout=30) as response:
            original = response.read(len(expected) + 1)
        if original != expected:
            raise RuntimeError(f"{filename}의 내용이 평가 고정본과 다릅니다. --isolated를 사용하세요.")

    for filename, data in fixtures.items():
        document = by_name.get(filename)
        if document is None:
            document = upload_document(base_url, filename, data)
            print(f"문서 등록: {filename} ({document['chunk_count']} 구간)", flush=True)
        if document["status"] != "completed":
            raise RuntimeError(f"평가 문서 추출 실패: {filename}: {document.get('error_message')}")
        if document.get("index_status") != "ready":
            document = request_json(f"{base_url}/api/documents/{document['id']}/index", {})
            if document.get("index_status") != "ready":
                raise RuntimeError(f"평가 문서 인덱싱 실패: {filename}: {document.get('error_message')}")
    return {filename: hashlib.sha256(data).hexdigest() for filename, data in fixtures.items()}


def authenticate(base_url: str):
    email = os.getenv("EVAL_EMAIL", "").strip()
    password = os.getenv("EVAL_PASSWORD", "")
    if not email or not password:
        raise RuntimeError("로그인 정보가 필요합니다. 웹에서 만든 계정의 EVAL_EMAIL과 EVAL_PASSWORD를 환경 변수로 설정하세요.")
    request_json(f"{base_url}/api/auth/login", {"email": email, "password": password}, timeout=30)


def wait_for_local_api(process: subprocess.Popen, log_path: Path) -> str:
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        log = log_path.read_text(encoding="utf-8", errors="replace")
        if process.poll() is not None:
            raise RuntimeError(f"임시 평가 API가 종료됐습니다. 서버 로그:\n{log[-3000:]}")
        address = re.search(r"Uvicorn running on (http://127\.0\.0\.1:\d+)", log)
        if address:
            base_url = address.group(1)
            request_json(f"{base_url}/api/health", timeout=5)
            return base_url
        time.sleep(0.15)
    raise RuntimeError(f"임시 평가 API 시작 시간이 초과됐습니다. 서버 로그:\n{log[-3000:]}")


@contextmanager
def isolated_api():
    with tempfile.TemporaryDirectory(prefix="munseodam-evaluation-") as directory:
        workspace = Path(directory)
        log_path = workspace / "api.log"
        environment = {
            key: value for key, value in os.environ.items()
            if not key.startswith(("KAKAO_", "SMTP_", "EVAL_"))
            and key not in {"APP_ORIGIN", "CHUNK_CHARS", "CHUNK_OVERLAP", "MAX_COSINE_DISTANCE"}
        }
        environment.update(
            DATABASE_URL=f"sqlite:///{(workspace / 'evaluation.sqlite3').as_posix()}",
            STORAGE_DIR=str(workspace / "uploads"),
            OLLAMA_BASE_URL="http://127.0.0.1:11434",
            OLLAMA_CHAT_MODEL=CHAT_MODEL,
            OLLAMA_EMBEDDING_MODEL=EMBEDDING_MODEL,
            AUTH_COOKIE_SECURE="false",
            NO_PROXY="localhost,127.0.0.1,::1",
            PYTHONIOENCODING="utf-8",
        )
        with log_path.open("wb") as log_file:
            process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", "server",
                 "--host", "127.0.0.1", "--port", "0", "--no-access-log"],
                cwd=ROOT.parent, env=environment, stdout=log_file, stderr=subprocess.STDOUT,
            )
            try:
                yield wait_for_local_api(process, log_path)
            finally:
                if process.poll() is None:
                    if os.name == "nt":
                        # The venv launcher and the Python server are separate processes on Windows.
                        subprocess.run(
                            ["taskkill", "/pid", str(process.pid), "/t", "/f"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, timeout=15,
                        )
                    else:
                        process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()


def check_readiness(base_url: str) -> dict:
    ready = request_json(f"{base_url}/api/ready")
    database = ready["database"]
    if not database["available"] or not (database.get("backend") == "sqlite" or database["pgvector"]):
        raise RuntimeError(f"검색 DB 준비 실패: {database}")
    for kind, name in (("chat", CHAT_MODEL), ("embedding", EMBEDDING_MODEL)):
        model = ready["models"][kind]
        if model["name"] != name:
            raise RuntimeError(f"평가에는 {name} 모델이 필요합니다. API 모델 설정을 확인하세요.")
        if not model["functional"]:
            raise RuntimeError(f"{name} 모델을 호출하지 못했습니다. 로컬 Ollama와 모델 설치 상태를 확인하세요.")
    return ready


def normalize(value: str) -> str:
    return "".join(char for char in value.lower() if not char.isspace() and char.isalnum())


def includes_required(answer: str, requirements) -> bool:
    normalized = normalize(answer)
    for requirement in requirements:
        alternatives = requirement if isinstance(requirement, list) else [requirement]
        if not any(normalize(alternative) in normalized for alternative in alternatives):
            return False
    return True


def rate(numerator: int, denominator: int):
    return numerator / denominator if denominator else None


def evaluate_suite(base_url: str, suite_name: str, questions_path: Path):
    questions = json.loads(questions_path.read_text(encoding="utf-8"))
    expected_count = 36 if suite_name == "gold" else 12
    if len(questions) != expected_count:
        raise RuntimeError(f"{suite_name} 질문 수가 {expected_count}개가 아닙니다: {len(questions)}")

    answerable = [question for question in questions if question["answerable"]]
    unanswerable = [question for question in questions if not question["answerable"]]
    recall_hits = answer_hits = citation_hits = abstention_hits = 0
    recall_mode_hits = {mode: 0 for mode in ("keyword", "vector", "hybrid")}
    elapsed_ms = []
    results = []
    for position, question in enumerate(questions, start=1):
        print(f"[{suite_name} {position}/{len(questions)}] {question['id']} 검색 및 답변", flush=True)
        searches = {
            mode: request_json(f"{base_url}/api/search", {"query": question["question"], "top_k": 5, "mode": mode})
            for mode in ("keyword", "vector", "hybrid")
        }
        retrieved_by_mode = {
            mode: {item.get("section_id") for item in search["results"] if item.get("section_id")}
            for mode, search in searches.items()
        }
        expected_ids = set(question["required_sections"])
        recall_by_mode = {
            mode: bool(expected_ids) and expected_ids.issubset(sections)
            for mode, sections in retrieved_by_mode.items()
        }
        recall_ok = recall_by_mode["vector"]
        if question["answerable"]:
            for mode in recall_mode_hits:
                recall_mode_hits[mode] += int(recall_by_mode[mode])
            recall_hits += int(recall_ok)

        started = time.perf_counter()
        chat = request_json(f"{base_url}/api/chat", {"query": question["question"]})
        elapsed = (time.perf_counter() - started) * 1000
        elapsed_ms.append(elapsed)
        cited_ids = {item.get("section_id") for item in chat.get("sources", []) if item.get("section_id")}
        answer_body = re.split(r"(?:^|\s)근거\s*원문\s*[:：]", chat["answer"], maxsplit=1)[0].strip()
        answer_ok = question["answerable"] and not chat["abstained"] and includes_required(answer_body, question["must_include"])
        allowed_citations = set(question.get("allowed_citation_sections", question["required_sections"]))
        citation_ok = question["answerable"] and expected_ids.issubset(cited_ids) and cited_ids.issubset(allowed_citations)
        abstention_ok = not question["answerable"] and chat["abstained"]
        answer_hits += int(answer_ok)
        citation_hits += int(citation_ok)
        abstention_hits += int(abstention_ok)
        results.append({
            "id": question["id"], "question": question["question"],
            "answerable": question["answerable"], "recall_at_5_hit": recall_ok,
            "retrieved_sections": {mode: sorted(sections) for mode, sections in retrieved_by_mode.items()},
            "recall_at_5_by_mode": recall_by_mode,
            "cosine_distances": [item.get("cosine_distance") for item in searches["vector"]["results"]],
            "answer": answer_body, "abstained": chat["abstained"], "cited_sections": sorted(cited_ids),
            "answer_correct": answer_ok, "source_accurate": citation_ok,
            "abstention_correct": abstention_ok, "latency_ms": round(elapsed, 1),
        })

    median_ms = statistics.median(elapsed_ms) if elapsed_ms else None
    metrics = {
        "recall_at_5": {"value": rate(recall_hits, len(answerable)), "hits": recall_hits, "total": len(answerable), "target": 0.85},
        "answer_correctness": {"value": rate(answer_hits, len(answerable)), "hits": answer_hits, "total": len(answerable), "target": 0.80},
        "source_accuracy": {"value": rate(citation_hits, len(answerable)), "hits": citation_hits, "total": len(answerable), "target": 0.90},
        "abstention_accuracy": {"value": rate(abstention_hits, len(unanswerable)), "hits": abstention_hits, "total": len(unanswerable), "target": 0.90},
        "median_response_ms": {"value": round(median_ms, 1) if median_ms is not None else None, "target": 10000},
    }
    comparison = {
        mode: {"hits": hits, "total": len(answerable), "value": rate(hits, len(answerable))}
        for mode, hits in recall_mode_hits.items()
    }
    for name, metric in metrics.items():
        value = metric["value"]
        metric["passed"] = (value <= metric["target"]) if name == "median_response_ms" and value is not None else (
            value >= metric["target"] if value is not None else False
        )
    return {
        "suite": suite_name,
        "question_count": len(questions),
        "counts": {"answerable": len(answerable), "unanswerable": len(unanswerable)},
        "metrics": metrics,
        "retrieval_comparison_recall_at_5": comparison,
        "results": results,
        "limitations": [
            "기획서에 언급된 골드 36문항 원본 파일이 저장소에 없어, 세 모노랩 규정과 문항 비율에 맞춰 이 저장소에서 구성했습니다.",
            "복합 질문의 부분 답변 오류를 수정할 때 이 문항들을 확인했으므로 결과는 개발 회귀 평가이며 독립 블라인드 점수가 아닙니다.",
            "정답성은 출처 발췌를 제외한 답변 본문의 핵심 구절로 자동 판정하며 의미가 같은 표현을 놓칠 수 있습니다.",
            "한 개의 고정된 가상 문서 집합 평가이며 실제 기업 문서 성능을 일반화하지 않습니다.",
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    api = parser.add_mutually_exclusive_group()
    api.add_argument("--base-url", help="연결할 평가용 API 주소 (기본 http://localhost:8000)")
    api.add_argument("--isolated", action="store_true", help="임시 SQLite API와 가상 문서만으로 평가")
    parser.add_argument("--suite", choices=("dev", "gold", "both"), default="gold")
    args = parser.parse_args()
    suites = ("dev", "gold") if args.suite == "both" else (args.suite,)
    context = isolated_api() if args.isolated else nullcontext((args.base_url or "http://localhost:8000").rstrip("/"))
    with context as base_url:
        ready = check_readiness(base_url)
        if args.isolated:
            request_json(f"{base_url}/api/auth/register", {
                "display_name": "문서담 평가",
                "email": "evaluation@example.invalid",
                "password": secrets.token_urlsafe(24),
            }, timeout=30)
        else:
            authenticate(base_url)
        fixture_hashes = ensure_fixture_documents(base_url)
        for suite in suites:
            report = evaluate_suite(base_url, suite, GOLD if suite == "gold" else DEV)
            report["generated_at"] = datetime.now(timezone.utc).isoformat()
            report["readiness"] = ready
            report["evaluation_environment"] = "isolated_sqlite_api" if args.isolated else "connected_api"
            report["fixture_sha256"] = fixture_hashes
            output_dir = ROOT / "results"
            output_dir.mkdir(exist_ok=True)
            output_path = output_dir / f"{suite}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps({"report": str(output_path), "metrics": report["metrics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
