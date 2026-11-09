"""Run a fresh, separate challenge corpus through the full local FastAPI flow."""

import hashlib
import argparse
import json
import re
import secrets
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

from run_evaluation import check_readiness, isolated_api, request_json, upload_document


ROOT = Path(__file__).resolve().parent
CHALLENGE = ROOT / "challenge"
DOCS = CHALLENGE / "docs"
QUESTIONS = CHALLENGE / "questions.json"


def normalize(value: str) -> str:
    return "".join(char for char in value.lower() if not char.isspace() and char.isalnum())


def includes_required(answer: str, requirements) -> bool:
    body = normalize(re.split(r"(?:^|\s)근거\s*원문\s*[:：]", answer, maxsplit=1)[0])
    return all(
        any(normalize(variant) in body for variant in (item if isinstance(item, list) else [item]))
        for item in requirements
    )


def seed_corpus(base_url: str, docs_dir: Path) -> dict[str, str]:
    request_json(f"{base_url}/api/auth/register", {
        "display_name": "문서담 도전 평가",
        "email": "challenge@example.invalid",
        "password": secrets.token_urlsafe(24),
    }, timeout=30)
    hashes = {}
    for path in sorted(
        path for path in docs_dir.iterdir()
        if path.is_file() and path.suffix.lower() in {".txt", ".docx", ".pdf"}
    ):
        data = path.read_bytes()
        document = upload_document(base_url, path.name, data)
        if document.get("status") != "completed" or document.get("index_status") != "ready":
            raise RuntimeError(f"도전 문서 처리 실패: {path.name}: {document}")
        hashes[path.name] = hashlib.sha256(data).hexdigest()
    return hashes


def expected_section_keys(section_ids: list[str], docs_dir: Path) -> set[str]:
    """Resolve fixture section IDs to the stable filename/title pair returned by the API."""
    resolved = set()
    for section_id in section_ids:
        if "::" in section_id:
            filename, heading = section_id.split("::", 1)
            if not filename or not heading or not (docs_dir / filename).is_file():
                raise ValueError(f"잘못된 도전 평가 문서/제목: {section_id}")
            resolved.add(section_id)
            continue
        match = re.fullmatch(r"(.+)-S(\d+)", section_id)
        if not match:
            raise ValueError(f"잘못된 도전 평가 section ID: {section_id}")
        code, ordinal = match.group(1), int(match.group(2))
        filename = f"{code}.txt"
        path = docs_dir / filename
        headings = [
            line.lstrip("# ").strip()
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.startswith("## ")
        ]
        if not 1 <= ordinal <= len(headings):
            raise ValueError(f"{section_id}에 해당하는 제목을 찾지 못했습니다.")
        resolved.add(f"{filename}::{headings[ordinal - 1]}")
    return resolved


def source_keys(items: list[dict]) -> set[str]:
    return {
        f"{item.get('filename')}::{item.get('section_path')}"
        for item in items
        if item.get("filename") and item.get("section_path")
    }


def evaluate(base_url: str, questions_path: Path, docs_dir: Path, question_ids: set[str] | None = None) -> dict:
    questions = json.loads(questions_path.read_text(encoding="utf-8"))
    if question_ids:
        questions = [item for item in questions if item["id"] in question_ids]
        found_ids = {item["id"] for item in questions}
        missing_ids = question_ids - found_ids
        if missing_ids:
            raise ValueError(f"질문 파일에 없는 ID: {', '.join(sorted(missing_ids))}")
    if not questions:
        raise ValueError("평가할 질문이 없습니다.")
    rows, latencies = [], []
    for index, item in enumerate(questions, 1):
        print(f"[challenge {index}/{len(questions)}] {item['id']} 검색 및 답변", flush=True)
        search = request_json(f"{base_url}/api/search", {
            "query": item["question"], "top_k": 5, "mode": "vector",
        })
        retrieved = source_keys(search.get("results", []))
        retrieval_distances = [
            {"section": f"{row.get('filename')}::{row.get('section_path')}", "distance": row.get("cosine_distance")}
            for row in search.get("results", [])
        ]
        required = expected_section_keys(item["required_sections"], docs_dir)
        recall = required.issubset(retrieved)
        start = time.perf_counter()
        chat = request_json(f"{base_url}/api/chat", {"query": item["question"]})
        latency_ms = (time.perf_counter() - start) * 1000
        latencies.append(latency_ms)
        cited = source_keys(chat.get("sources", []))
        answer = chat.get("answer", "")
        correct = (
            not chat.get("abstained") and includes_required(answer, item.get("must_include", []))
            if item["answerable"] else bool(chat.get("abstained"))
        )
        citation_recall = item["answerable"] and required.issubset(cited)
        citation_precision = item["answerable"] and bool(cited) and cited.issubset(required)
        rows.append({
            "id": item["id"], "question": item["question"], "answerable": item["answerable"],
            "answer": answer, "abstained": chat.get("abstained"),
            "abstention_reason": chat.get("reason"),
            "retrieved_sections": sorted(retrieved), "cited_sections": sorted(cited),
            "retrieval_distances": retrieval_distances,
            "retrieval_recall_at_5": recall, "answer_or_abstention_correct": correct,
            "citation_recall": citation_recall, "citation_precision": citation_precision,
            "latency_ms": round(latency_ms, 1),
        })
    answerable = [row for row in rows if row["answerable"]]
    unanswerable = [row for row in rows if not row["answerable"]]

    def metric(key, selected):
        hits = sum(bool(row[key]) for row in selected)
        return {"hits": hits, "total": len(selected), "value": hits / len(selected) if selected else None}

    return {
        "suite": "fresh_local_challenge",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": {"total": len(rows), "answerable": len(answerable), "unanswerable": len(unanswerable)},
        "metrics": {
            "recall_at_5": metric("retrieval_recall_at_5", answerable),
            "answer_correctness": metric("answer_or_abstention_correct", answerable),
            "citation_recall": metric("citation_recall", answerable),
            "citation_precision": metric("citation_precision", answerable),
            "abstention_accuracy": metric("answer_or_abstention_correct", unanswerable),
            "median_response_ms": round(statistics.median(latencies), 1) if latencies else None,
        },
        "results": rows,
        "limitations": [
            "이 평가는 기존 모노랩 회귀 세트와 분리한 자체 작성 가상 문서 도전 세트입니다.",
            "규칙과 질문은 사람이 작성했으며 실제 회사 자료를 대표하거나 대규모 독립 블라인드 평가를 대신하지 않습니다.",
            "정답성은 핵심 문구 일치로 자동 판정해 의미가 같은 다른 표현을 오답으로 볼 수 있습니다.",
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--questions", type=Path, default=QUESTIONS)
    parser.add_argument("--docs", type=Path, default=DOCS)
    parser.add_argument("--ids", help="선택할 질문 ID를 쉼표로 구분합니다.")
    args = parser.parse_args()
    question_ids = {item.strip() for item in args.ids.split(",") if item.strip()} if args.ids else None
    with isolated_api() as base_url:
        readiness = check_readiness(base_url)
        fixture_hashes = seed_corpus(base_url, args.docs)
        report = evaluate(base_url, args.questions, args.docs, question_ids)
        report["question_set"] = str(args.questions.relative_to(ROOT)) if args.questions.is_relative_to(ROOT) else args.questions.name
        report["question_set_sha256"] = hashlib.sha256(args.questions.read_bytes()).hexdigest()
        report["document_set"] = str(args.docs.relative_to(ROOT)) if args.docs.is_relative_to(ROOT) else args.docs.name
        report["readiness"] = readiness
        report["evaluation_environment"] = "isolated_sqlite_api_fresh_challenge"
        report["fixture_sha256"] = fixture_hashes
        output_dir = ROOT / "results"
        output_dir.mkdir(exist_ok=True)
        if args.questions.resolve() == QUESTIONS.resolve() and args.docs.resolve() == DOCS.resolve():
            prefix = "challenge"
        else:
            prefix = re.sub(r"_questions$", "", args.questions.stem)
        output_path = output_dir / f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"report": str(output_path), "metrics": report["metrics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
