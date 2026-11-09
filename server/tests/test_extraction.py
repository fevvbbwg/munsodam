import io
import unittest

from docx import Document as DocxDocument

from server.app.extraction import ExtractedSection, chunk_sections, extract_text


def make_text_pdf(text: str) -> bytes:
    """Build a small one-page PDF in memory without adding a test-only dependency."""
    stream = b""
    if text:
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET\n".encode("ascii")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n"
        + stream + b"endstream",
    ]
    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode("ascii"))
        output.extend(body)
        output.extend(b"\nendobj\n")

    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(output)


class TextExtractionTests(unittest.TestCase):
    def test_txt_heading_creates_sections_and_preserves_utf8_bom_support(self):
        data = "\ufeff# 출장 규정\n정산은 복귀 후 7일 이내에 합니다.\n\n영수증을 첨부합니다.\n## 택시비\n이용 사유를 제출합니다.".encode("utf-8")

        sections = extract_text("policy.txt", data)

        self.assertEqual(
            [(section.text, section.section_path) for section in sections],
            [
                ("정산은 복귀 후 7일 이내에 합니다.\n영수증을 첨부합니다.", "출장 규정"),
                ("이용 사유를 제출합니다.", "택시비"),
            ],
        )

    def test_docx_preserves_paragraph_table_order_and_heading_location(self):
        document = DocxDocument()
        document.add_heading("출장 정책", level=1)
        document.add_paragraph("교통비를 정산합니다.")
        table = document.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "항목"
        table.cell(0, 1).text = "증빙"
        document.add_paragraph("영수증을 첨부합니다.")
        stream = io.BytesIO()
        document.save(stream)

        sections = extract_text("policy.docx", stream.getvalue())

        self.assertEqual(
            [(section.text, section.section_path) for section in sections],
            [
                ("출장 정책", "출장 정책"),
                ("교통비를 정산합니다.", "출장 정책"),
                ("항목 | 증빙", "출장 정책"),
                ("영수증을 첨부합니다.", "출장 정책"),
            ],
        )

    def test_docx_nested_headings_keep_parent_context(self):
        document = DocxDocument()
        document.add_heading("출장 정책", level=1)
        document.add_heading("교통비", level=2)
        document.add_paragraph("택시비는 영수증을 제출한다.")
        document.add_heading("식비", level=2)
        document.add_paragraph("식비는 하루 한도를 따른다.")
        document.add_heading("휴가 정책", level=1)
        document.add_paragraph("연차는 사전에 신청한다.")
        stream = io.BytesIO()
        document.save(stream)

        sections = extract_text("nested.docx", stream.getvalue())

        self.assertEqual(
            [(section.text, section.section_path) for section in sections],
            [
                ("출장 정책", "출장 정책"),
                ("교통비", "출장 정책 / 교통비"),
                ("택시비는 영수증을 제출한다.", "출장 정책 / 교통비"),
                ("식비", "출장 정책 / 식비"),
                ("식비는 하루 한도를 따른다.", "출장 정책 / 식비"),
                ("휴가 정책", "휴가 정책"),
                ("연차는 사전에 신청한다.", "휴가 정책"),
            ],
        )

    def test_pdf_extracts_text_and_keeps_page_number(self):
        sections = extract_text("policy.pdf", make_text_pdf("PDF policy text"))

        self.assertEqual(len(sections), 1)
        self.assertEqual(sections[0].text, "PDF policy text")
        self.assertEqual(sections[0].page_number, 1)

    def test_textless_pdf_is_reported_as_unsupported_scan(self):
        with self.assertRaisesRegex(ValueError, "스캔 이미지 PDF"):
            extract_text("scan.pdf", make_text_pdf(""))

    def test_chunking_carries_page_and_heading_location(self):
        chunks = chunk_sections(
            [ExtractedSection("abcdefghijk", page_number=3, section_path="출장 정책")],
            size=8,
            overlap=2,
        )

        self.assertEqual(
            chunks,
            [
                ("abcdefgh", 3, "출장 정책"),
                ("ghijk", 3, "출장 정책"),
            ],
        )

    def test_long_policy_prefers_sentence_boundaries_and_preserves_rule(self):
        rule = "작업실에서 시제품 촬영은 관리자 승인 후 가능하다."
        text = "일반 안내를 먼저 확인한다. " * 2 + rule + " 보관함은 매일 점검한다."
        chunks = chunk_sections([ExtractedSection(text, section_path="촬영 규칙")], size=62, overlap=12)

        self.assertTrue(any(rule in content for content, _page, _heading in chunks))
        self.assertTrue(all(len(content) <= 62 for content, _page, _heading in chunks))
        self.assertTrue(all(heading == "촬영 규칙" for _content, _page, heading in chunks))


if __name__ == "__main__":
    unittest.main()
