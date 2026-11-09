import io
import re
from dataclasses import dataclass
from pathlib import Path

from docx import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader


@dataclass
class ExtractedSection:
    text: str
    page_number: int | None = None
    section_path: str | None = None


def extract_text(filename: str, data: bytes) -> list[ExtractedSection]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(io.BytesIO(data), strict=True)
        sections = [
            ExtractedSection(text=(page.extract_text() or "").strip(), page_number=index)
            for index, page in enumerate(reader.pages, start=1)
        ]
        if not any(section.text for section in sections):
            raise ValueError("PDF에서 텍스트를 찾지 못했습니다. 스캔 이미지 PDF는 지원하지 않습니다.")
        return [section for section in sections if section.text]
    if suffix == ".docx":
        document = DocxDocument(io.BytesIO(data))
        sections: list[ExtractedSection] = []
        current_heading = ""
        heading_levels: dict[int, str] = {}
        for block in document.iter_inner_content():
            if isinstance(block, Paragraph):
                content = block.text.strip()
                if not content:
                    continue
                if block.style and block.style.name.lower().startswith("heading"):
                    level_match = re.search(r"\d+", block.style.name)
                    level = int(level_match.group()) if level_match else 1
                    heading_levels = {key: value for key, value in heading_levels.items() if key < level}
                    heading_levels[level] = content
                    current_heading = " / ".join(heading_levels[key] for key in sorted(heading_levels))
                sections.append(ExtractedSection(content, section_path=current_heading or None))
            elif isinstance(block, Table):
                for row in block.rows:
                    cells = [re.sub(r"\s+", " ", cell.text).strip() for cell in row.cells]
                    content = " | ".join(cell for cell in cells if cell)
                    if content:
                        sections.append(ExtractedSection(content, section_path=current_heading or "표"))
        if not sections:
            raise ValueError("DOCX 문서에서 텍스트를 찾지 못했습니다.")
        return sections
    if suffix == ".txt":
        content = data.decode("utf-8-sig").strip()
        if not content:
            raise ValueError("TXT 문서에 추출할 텍스트가 없습니다.")
        sections: list[ExtractedSection] = []
        current_heading = None
        body: list[str] = []

        def flush() -> None:
            if body:
                sections.append(ExtractedSection("\n".join(body), section_path=current_heading))
                body.clear()

        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                flush()
                current_heading = line.lstrip("# ").strip() or current_heading
            else:
                body.append(line)
        flush()
        if not sections:
            sections.append(ExtractedSection(content))
        return sections
    raise ValueError("지원하지 않는 파일 형식입니다. PDF, DOCX, TXT만 등록할 수 있습니다.")


def chunk_sections(sections: list[ExtractedSection], size: int, overlap: int):
    chunks = []
    for section in sections:
        text = re.sub(r"\s+", " ", section.text).strip()
        if not text:
            continue
        start = 0
        while start < len(text):
            limit = min(start + size, len(text))
            end = limit
            if limit < len(text):
                boundary_start = start + max(1, size // 2)
                sentence_boundaries = list(re.finditer(r"[.!?。！？;；]\s+", text[boundary_start:limit]))
                if sentence_boundaries:
                    end = boundary_start + sentence_boundaries[-1].end()
                else:
                    word_boundary = text.rfind(" ", boundary_start, limit)
                    if word_boundary >= boundary_start:
                        end = word_boundary + 1
            piece = text[start:end].strip()
            if piece:
                chunks.append((piece, section.page_number, section.section_path))
            if end >= len(text):
                break
            next_start = max(start + 1, end - overlap)
            if next_start < len(text) and not text[next_start - 1].isspace():
                word_start = text.rfind(" ", start, next_start)
                if word_start >= start:
                    next_start = max(start + 1, word_start + 1)
            start = next_start
    return chunks
