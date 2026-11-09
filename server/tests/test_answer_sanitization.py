import unittest

from server.app.main import clean_internal_citation_metadata, clean_redundant_comparison


class InternalCitationCleanupTests(unittest.TestCase):
    def test_removes_trailing_json_brace_after_index_list(self):
        self.assertEqual(
            clean_internal_citation_metadata("답변입니다. source_indices: [1]}"),
            "답변입니다.",
        )

    def test_removes_parenthesized_numeric_source_index(self):
        self.assertEqual(
            clean_internal_citation_metadata("답변입니다. (source_indices: 2)"),
            "답변입니다.",
        )

    def test_preserves_braces_that_are_part_of_the_answer(self):
        answer = '설정 예시는 {"enabled": true}입니다.'
        self.assertEqual(clean_internal_citation_metadata(answer), answer)

    def test_removes_redundant_file_and_section_narration(self):
        answer = "연차는 근무일 3일 전까지 등록합니다. 이는 HR-01.txt 파일의 '계획 연차' 섹션에 명시되어 있습니다."
        self.assertEqual(clean_internal_citation_metadata(answer), "연차는 근무일 3일 전까지 등록합니다.")

    def test_removes_a_redundant_closing_procedure_sentence_but_keeps_a_standalone_answer(self):
        answer = "분실 시 IT 담당자에게 알리고 택시 영수증을 제출합니다. 보고와 정산에 필요한 일은 이와 같은 절차를 따르는 것입니다."
        self.assertEqual(clean_internal_citation_metadata(answer), "분실 시 IT 담당자에게 알리고 택시 영수증을 제출합니다.")
        standalone = "필요한 일은 이와 같은 절차를 따르는 것입니다."
        self.assertEqual(clean_internal_citation_metadata(standalone), standalone)

    def test_comparison_keeps_single_supported_list_instead_of_repeating_the_summary(self):
        answer = (
            "정산은 복귀 후 7일 이내이고 신고는 1시간 이내입니다.\n\n"
            "- 정산: 복귀 후 7일 이내 정산한다.- 신고: 1시간 이내 IT 담당자에게 알린다."
        )
        self.assertEqual(
            clean_redundant_comparison(answer, "정산과 신고 기한을 비교해 주세요"),
            "- 정산: 복귀 후 7일 이내 정산한다.\n- 신고: 1시간 이내 IT 담당자에게 알린다.",
        )
        self.assertEqual(clean_redundant_comparison(answer, "정산 기한이 언제인가요?"), answer)
        self.assertEqual(
            clean_redundant_comparison(answer.replace("7일", "8일", 1), "기한 비교"),
            answer.replace("7일", "8일", 1),
        )


if __name__ == "__main__":
    unittest.main()
