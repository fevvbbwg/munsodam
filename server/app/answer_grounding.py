import re
import unicodedata
from collections.abc import Iterable
from decimal import Decimal


_CLOCK_VALUE = re.compile(
    r"(?<![\d.,])(?:(?P<day_basis>근무일|영업일|달력일)\s*)?"
    r"(?P<hour>\d{1,2})\s*시\s*(?P<minute>[0-5]?\d)\s*분"
    r"\s*(?:(?:은|는|이(?!상|하|내|전|후)|가|을|를)\s*)?"
    r"(?P<bound>이내|이상|이하|초과(?:하는|할\s*경우)?|미만|이전|이후|안에|까지|넘는|넘을\s*때|넘으면|전|후)?"
)
_POLICY_VALUE = re.compile(
    r"(?<![\d.,])(?:(?P<day_basis>근무일|영업일|달력일)\s*)?"
    r"(?P<number>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*"
    r"(?P<unit>퍼센트|근무일|영업일|달력일|개월|시간|억\s*원|만\s*원|천\s*원|일|주|달|월|년|분|초|원|회|건|명|시(?!점)|%)"
    r"\s*(?:(?:은|는|이(?!상|하|내|전|후)|가|을|를)\s*)?"
    r"(?P<bound>이내|이상|이하|초과(?:하는|할\s*경우)?|미만|이전|이후|안에|까지|넘는|넘을\s*때|넘으면|전|후)?"
)
_DAY_BASES = {"근무일", "영업일", "달력일"}
_BOUND_ALIASES = {
    "안에": "이하", "이내": "이하", "까지": "이하", "이전": "전", "이후": "후",
    "넘는": "초과", "넘을때": "초과", "넘으면": "초과", "초과하는": "초과", "초과할경우": "초과",
}
_WON_MULTIPLIERS = {"천원": 1000, "만원": 10_000, "억원": 100_000_000}
_LIMIT_CONTEXT = re.compile(
    r"(?P<limit>최대|최소|한도(?:는|가)?|상한(?:은|이)?|하한(?:은|이)?)"
    r"\s*(?:(?:하루|매일)\s*)?(?:(?:\d+\s*회)|회당)?\s*$"
)
_RELATIVE_ANCHOR = re.compile(r"(?P<anchor>[가-힣A-Za-z]{2,12})\s*(?P<direction>전|후)\s*$")
_TIME_OF_DAY = re.compile(r"(?P<period>오전|오후|아침|저녁|밤)\s*$")
_TEMPORAL_CONDITION = re.compile(
    r"(?P<anchor>[가-힣]{2,12})\s*(?P<direction>이전|이후|전|후)(?:에)?\s*"
    r"(?:(?P<count>\d+)\s*)?(?P<unit>근무일|영업일|달력일|일|시간|분)?"
)
_TEMPORAL_QUESTION = re.compile(
    r"언제|기한|마감|며칠|시한|기간|몇\s*(?:근무일|영업일|달력일|일|주|개월|달|년|시간|시|분)"
)
_TEMPORAL_ACTION_GROUPS = (
    ("냉동", "얼리", "얼리기"),
    ("신청", "예약", "등록", "입력"),
    ("취소", "취소하"),
    ("풀리", "풀려", "해제", "해제되"),
    ("연락", "신고", "보고", "알리", "알린다", "알려", "통보"),
    ("제출", "첨부"),
    ("정산", "청구", "지급"),
    ("반납", "반환"),
    ("보관", "유지", "저장"),
    ("잠금", "잠기", "잠겨", "해제", "풀리", "풀려"),
)
_SENTENCE_BOUNDARY = re.compile(r"[.!?。！？;；\n]+|(?<!\d)[,，](?!\d)")
_GENERIC_CONTEXT = {
    "경우", "기준", "내용", "대상", "때", "등", "및", "또는", "관련", "가능", "불가",
    "이내", "이상", "이하", "초과", "미만", "이전", "이후", "까지", "전", "후",
    "하루", "매일", "한도", "상한", "하한", "금액", "비용", "원", "정도", "대해",
    "에서", "으로", "에게", "부터", "까지", "대한", "하는", "한다", "합니다", "해야",
    "수", "있다", "있습니다", "없다", "없습니다", "하며", "하고", "또한", "경우에는",
    "청구", "신청", "지급", "연락", "정산", "처리", "제출", "보고",
}
_GENERIC_CONTEXT_PREFIXES = (
    "근무일", "영업일", "달력일", "이내", "이상", "이하", "초과", "미만", "이전", "이후", "까지",
    "한도", "상한", "하한", "금액", "비용", "기준", "하루", "매일",
    "청구", "신청", "지급", "연락", "정산", "처리", "제출", "보고",
    "가능", "불가", "얼마", "무엇", "어떻게", "있다", "있습니다", "없다",
    "원", "있어", "입니다", "이다",
)
_PARTICLE_SUFFIXES = ("에서는", "으로는", "에게는", "에서", "에게", "으로", "와", "과", "은", "는", "이", "가", "을", "를", "도", "의", "에", "로")
_CONTEXT_SYNONYM_GROUPS = (
    frozenset({"구매", "구매건", "주문", "발주", "물품", "상품", "품목"}),
    frozenset({"출장비", "출장", "출장경비", "출장비용", "경비"}),
)
_DETAIL_UNIT_QUESTIONS = (
    (re.compile(r"몇\s*(?:시간|시)"), {"시간", "시", "시각"}),
    (re.compile(r"몇\s*분"), {"분"}),
    (re.compile(r"몇\s*(?:근무일|영업일|달력일|일)|며칠"), {"일"}),
    (re.compile(r"몇\s*(?:주|개월|달|월|년)"), {"주", "개월", "달", "월", "년"}),
    (re.compile(r"몇\s*(?:회|건|명)"), {"회", "건", "명"}),
)
_MONEY_DETAIL_QUESTION = re.compile(
    r"얼마|몇\s*(?:원|천원|만원)|"
    r"(?<![가-힣])금액(?:은|이|가)?\s*(?:얼마|몇)|"
    r"(?<![가-힣])(?:원화\s*)?(?:한도|상한|하한)(?:액)?"
    r"(?!\s*(?:을|를)?\s*(?:넘기|넘길|넘는|초과))|"
    r"(?<![가-힣])(?:요금|비용)\s*(?:은|이|가|의)?\s*(?:얼마|최대|한도|상한|하한)|"
    r"어디까지\s*(?:청구|정산)"
)
_EMAIL_DETAIL_QUESTION = re.compile(
    r"(?:이메일|메일)\s*(?:주소|은\s*무엇|이\s*(?:무엇|뭐|뭔))|"
    r"(?:담당자|승인자).{0,12}(?:이메일|메일)\s*주소"
)
_EMAIL_ADDRESS = re.compile(
    r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![A-Za-z0-9-])"
)


def _context_terms(text: str) -> set[str]:
    terms: set[str] = set()
    for token in re.findall(r"[a-zA-Z]+|[가-힣]{2,}", text.casefold()):
        for suffix in _PARTICLE_SUFFIXES:
            if token.endswith(suffix) and len(token) - len(suffix) >= 2:
                token = token[:-len(suffix)]
                break
        if token not in _GENERIC_CONTEXT and not token.startswith(_GENERIC_CONTEXT_PREFIXES):
            terms.add(token)
    return terms


def _mention_contexts(text: str):
    """Return the sentence containing each value, in mention order."""
    normalized = unicodedata.normalize("NFKC", text)
    starts = [0]
    for boundary in _SENTENCE_BOUNDARY.finditer(normalized):
        starts.append(boundary.end())
    ends = starts[1:] + [len(normalized)]
    for value_start, _value_end, _mention in _policy_value_matches(normalized):
        for start, end in zip(starts, ends):
            if start <= value_start < end:
                yield _context_terms(normalized[start:end])
                break


def _contexts_overlap(left: set[str], right: set[str]) -> bool:
    if any(
        len(shorter) >= 2 and shorter in longer
        for first in left for second in right
        for shorter, longer in ((first, second), (second, first))
    ):
        return True
    return any(left.intersection(group) and right.intersection(group) for group in _CONTEXT_SYNONYM_GROUPS)


def _preserves_temporal_conditions(question: str, answer: str, excerpts: list[str]) -> bool:
    if not question or not _TEMPORAL_QUESTION.search(question):
        return True
    question_terms = _context_terms(question)
    answer_normalized = unicodedata.normalize("NFKC", answer)
    for excerpt in excerpts:
        normalized_excerpt = unicodedata.normalize("NFKC", excerpt)
        sentences = re.split(r"(?<=[.!?。！？;；])\s+|\n+", normalized_excerpt)
        for sentence in sentences:
            clauses = re.split(r"[,，;；]|하고\s+|하며\s+|한\s+뒤\s+|한\s+후\s+", sentence)
            for clause in clauses:
                clause_terms = _context_terms(clause)
                if not _contexts_overlap(question_terms, clause_terms):
                    continue
                action_groups = [
                    group for group in _TEMPORAL_ACTION_GROUPS
                    if any(action in question for action in group)
                ]
                # An informal question about a reservation being "released" can
                # mention reservation as its topic. In that case, the requested
                # action is the release condition, not the earlier booking deadline.
                release_groups = [
                    group for group in action_groups
                    if any(action in group for action in ("풀리", "풀려", "해제", "해제되"))
                    and any(action in question for action in ("풀리", "풀려", "해제"))
                ]
                if release_groups:
                    action_groups = release_groups
                if action_groups and not any(
                    any(action in clause for action in group)
                    for group in action_groups
                ):
                    continue
                for condition in _TEMPORAL_CONDITION.finditer(clause):
                    anchor = condition["anchor"]
                    direction = condition["direction"]
                    direction_forms = {"전", "이전"} if direction in {"전", "이전"} else {"후", "이후"}
                    anchor_pattern = re.escape(anchor) + r"\s*(?:은|는|이|가|을|를|의)?\s*"
                    preserved = any(
                        re.search(anchor_pattern + re.escape(form) + r"(?:에)?", answer_normalized)
                        for form in direction_forms
                    )
                    if not preserved:
                        return False
                    unit = condition["unit"]
                    if unit and unit not in answer_normalized:
                        return False
    return True


def _clock_minutes(value: tuple[Decimal, str, str, str]) -> Decimal | None:
    number, unit, _day_basis, _bound = value
    if unit == "시":
        return number * 60
    if unit == "시각":
        return number
    return None


def _is_supported_negative_clock_comparison(claim, answer: str, question_mentions, evidence) -> bool:
    """Allow a scenario to be described as before a threshold that requires a later time."""
    claim_value, _relative, _period = claim
    _number, _unit, _day_basis, bound = claim_value
    threshold_minutes = _clock_minutes(claim_value)
    if threshold_minutes is None or bound != "전":
        return False

    matching_thresholds = [
        mention[0]
        for mention, _context in evidence
        if mention[0][:3] == claim_value[:3] and mention[0][3] == "후"
    ]
    if not matching_thresholds:
        return False

    scenarios = [
        mention[0]
        for mention, _context in question_mentions
        if (scenario_minutes := _clock_minutes(mention[0])) is not None
        and scenario_minutes < threshold_minutes
    ]
    if not scenarios:
        return False

    negative = re.compile(r"아니|아닙|않|안\s*됩|불가|못|금지")
    for sentence in re.split(r"(?<=[.!?。！？;；])\s+|\n+", answer):
        if not negative.search(sentence):
            continue
        sentence_values = [mention[0] for mention in policy_value_mentions(sentence)]
        if any(scenario in sentence_values for scenario in scenarios) and any(
            item[:3] == claim_value[:3] and item[3] == "전"
            for item in sentence_values
        ):
            return True
    return False


def _policy_value_matches(normalized: str):
    matches = []
    clock_spans = []
    for match in _CLOCK_VALUE.finditer(normalized):
        hour = int(match["hour"])
        minute = int(match["minute"])
        if hour > 24 or (hour == 24 and minute != 0):
            continue
        value_minutes = Decimal(hour * 60 + minute)
        bound = re.sub(r"\s+", "", match["bound"] or "")
        prefix = normalized[max(0, match.start() - 24):match.start()]
        period = _TIME_OF_DAY.search(prefix)
        period_name = period["period"] if period else None
        if period_name in {"오후", "저녁", "밤"} and hour < 12:
            value_minutes += Decimal(12 * 60)
        elif period_name in {"오전", "아침"} and hour == 12:
            value_minutes -= Decimal(12 * 60)
        normalized_bound = _BOUND_ALIASES.get(bound, bound)
        relative = _RELATIVE_ANCHOR.search(prefix)
        value = (value_minutes, "시각", "", normalized_bound)
        matches.append((match.start(), match.end(), (value, (relative["anchor"], relative["direction"]) if relative else None, None)))
        clock_spans.append((match.start(), match.end()))

    for match in _POLICY_VALUE.finditer(normalized):
        if any(start < match.end() and match.start() < end for start, end in clock_spans):
            continue
        unit = re.sub(r"\s+", "", match["unit"])
        number = Decimal(match["number"].replace(",", ""))
        day_basis = match["day_basis"] or ""
        if unit in _DAY_BASES:
            day_basis, unit = unit, "일"
        if unit == "퍼센트":
            unit = "%"
        if unit in _WON_MULTIPLIERS:
            number *= _WON_MULTIPLIERS[unit]
            unit = "원"
        bound = re.sub(r"\s+", "", match["bound"] or "")
        if not bound:
            context = _LIMIT_CONTEXT.search(normalized[max(0, match.start() - 24):match.start()])
            if context:
                bound = "이상" if context["limit"].startswith(("최소", "하한")) else "이하"
        prefix = normalized[max(0, match.start() - 24):match.start()]
        relative = _RELATIVE_ANCHOR.search(prefix)
        period = _TIME_OF_DAY.search(prefix) if unit == "시" else None
        period_name = period["period"] if period else None
        if period_name and unit == "시":
            if period_name in {"오후", "저녁", "밤"} and number < 12:
                number += 12
            elif period_name in {"오전", "아침"} and number == 12:
                number = Decimal(0)
            period_name = None
        value = (number, unit, day_basis, _BOUND_ALIASES.get(bound, bound))
        matches.append((match.start(), match.end(), (
            value,
            (relative["anchor"], relative["direction"]) if relative else None,
            period_name,
        )))

    return sorted(matches, key=lambda item: item[0])


def policy_value_mentions(text: str):
    normalized = unicodedata.normalize("NFKC", text)
    for _start, _end, mention in _policy_value_matches(normalized):
        yield mention


def policy_values(text: str):
    for value, _relative, _period in policy_value_mentions(text):
        yield value


def answer_covers_requested_detail(question: str, answer: str) -> bool:
    """Reject an answer that changes a requested numeric dimension into a nearby fact."""
    normalized_question = unicodedata.normalize("NFKC", question)
    has_explicit_absence = bool(re.search(
        r"(?:정하지\s*않|정해져\s*있지\s*않|명시하지\s*않|기재하지\s*않|규정하지\s*않|별도.{0,8}없|확인되지\s*않)", answer
    ))
    if (
        "직접" in normalized_question
        and re.search(r"(?:.{0,6}도\s*(?:되|돼)|할\s*수\s*있|가능|허용|괜찮)", normalized_question)
        and not re.search(r"(?:않|하지|못|금지|불가|안\s*됩|아닙|할\s*수\s*없|가능|허용)", answer)
    ):
        return False
    if "직접" in normalized_question and re.search(r".{0,8}(?:아야|어야)\s*하지\s*않", answer):
        return False
    if _EMAIL_DETAIL_QUESTION.search(normalized_question):
        return _EMAIL_ADDRESS.search(answer) is not None
    answer_units = {value[0][1] for value in policy_value_mentions(answer)}
    for pattern, required_units in _DETAIL_UNIT_QUESTIONS:
        if pattern.search(normalized_question):
            if "시" in required_units and re.search(r"(?:근무|업무|출근|퇴근|복귀|출발|도착)[^.!?。！？\n]{0,8}(?:전|후)", answer):
                return True
            if answer_units.intersection(required_units):
                return True
            dimension_terms = {
                "시간": r"시간|시각|교육|기간|소요|처리",
                "분": r"분|시간|소요|처리",
                "일": r"일|기간|기한|마감|근무일|영업일|보관",
                "주": r"주|기간|기한|마감",
                "개월": r"개월|달|월|기간|기한|마감",
                "달": r"달|개월|월|기간|기한|마감",
                "월": r"월|개월|달|기간|기한|마감",
                "년": r"년|기간|기한|마감|보관",
                "회": r"회|횟수|주기|빈도",
                "건": r"건|수량|횟수",
                "명": r"명|인원|대상",
            }
            matching_markers = [dimension_terms[unit] for unit in required_units if unit in dimension_terms]
            return has_explicit_absence and any(re.search(marker, answer) for marker in matching_markers)
    if _MONEY_DETAIL_QUESTION.search(normalized_question):
        return bool(answer_units.intersection({"원", "%"})) or (
            has_explicit_absence and bool(re.search(r"비용|금액|요금|가격|한도|상한|하한|비율", answer))
        )
    return True


def asks_for_money_amount(question: str) -> bool:
    return _MONEY_DETAIL_QUESTION.search(unicodedata.normalize("NFKC", question)) is not None


def approval_claim_supported(question: str, answer: str, excerpts: Iterable[str]) -> bool:
    """Do not infer who approves from a nearby contact or escalation rule."""
    normalized_question = unicodedata.normalize("NFKC", question)
    if not re.search(r"(?:누가|누구|승인자|결재자).{0,24}(?:승인|결재)|(?:승인|결재).{0,24}(?:누가|누구|담당)", normalized_question):
        return True
    approval_rule = re.compile(r"(?:승인.{0,18}(?:받아야|필요|한다|해야|권한)|(?:받아야|필요|한다|해야).{0,18}승인)")
    roles = re.compile(r"총무\s*책임자|인사\s*담당자|보안\s*담당자|품질\s*담당자|팀장|관리자|상사|부서장|본부장|책임자|승인자|결재자")
    documented_roles = set()
    for excerpt in excerpts:
        for sentence in re.split(r"[.!?。！？;；\n]+", unicodedata.normalize("NFKC", excerpt)):
            if approval_rule.search(sentence):
                documented_roles.update(roles.findall(sentence))
    if not documented_roles:
        return False
    answer_roles = set(roles.findall(unicodedata.normalize("NFKC", answer)))
    return bool(documented_roles.intersection(answer_roles))


def cited_latin_names_support(answer: str, excerpts: Iterable[str]) -> bool:
    """Do not introduce an uncited product, system, address, or Latin identifier."""
    pattern = re.compile(r"(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9._/-]{1,}(?![A-Za-z0-9])")
    source_text = " ".join(excerpts)
    answer_emails = {item.casefold() for item in _EMAIL_ADDRESS.findall(answer)}
    source_emails = {item.casefold() for item in _EMAIL_ADDRESS.findall(source_text)}
    if not answer_emails.issubset(source_emails):
        return False
    names = {item.strip("./-").casefold() for item in pattern.findall(answer)}
    if not names:
        return True
    documented = {
        item.strip("./-").casefold()
        for item in pattern.findall(source_text)
    }
    return names.issubset(documented)


def permission_claim_supported(question: str, answer: str, excerpts: Iterable[str]) -> bool:
    """Reject a yes/no permission conclusion that reverses an explicit cited rule."""
    if _MONEY_DETAIL_QUESTION.search(question) or re.search(r"어떤\s*경우|무슨\s*경우", question) or (
        "승인" in question and re.search(r"승인.{0,12}(?:전|먼저)", question)
    ):
        return True
    if not re.search(r"허용|금지|가능|(?:\S{1,12})도\s*(?:돼|되)|할\s*수\s*있|안\s*되|못\s*하", question):
        return True
    negative = re.compile(r"허용하지\s*않|허용되지\s*않|금지|할\s*수\s*없|하지\s*않|하지\s*말|올리지\s*않|안\s*됩|불가|못\s*한|완료\s*처리하지")
    positive = re.compile(r"허용(?:한다|된다|됩니다|돼요|되?지만|되?(?=[.!?。！？;；]|$))|가능(?:하다|합니다|해요|하지만|(?=[.!?。！？;；]|$))|할\s*수\s*있|해도\s*(?:된다|됩니다|돼요|돼)|(?:^|[.!?。！？]\s*)(?:네|예)[,，.!]?", re.MULTILINE)
    def normalize_negated_ban(value: str) -> str:
        return re.sub(r"금지(?:되|하)지\s*않", "허용된다", value)

    normalized_answer = normalize_negated_ban(answer)
    answer_negative = bool(negative.search(normalized_answer) or re.search(r"(?:^|[.!?。！？]\s*)(?:아니요|아닙니다)[,，.!]?", normalized_answer))
    answer_positive = bool(positive.search(normalized_answer)) and not answer_negative
    if not answer_negative and not answer_positive:
        return True
    question_terms = _context_terms(question)
    relevant_rules: list[tuple[int, bool, bool, set[str]]] = []
    for excerpt in excerpts:
        for sentence in re.split(r"[.!?。！？;；\n]+", unicodedata.normalize("NFKC", excerpt)):
            for clause in re.split(r"\s*(?:하지만|반면|그러나|다만)\s*", sentence):
                sentence_terms = _context_terms(clause)
                if not _contexts_overlap(question_terms, sentence_terms):
                    continue
                normalized_clause = normalize_negated_ban(clause)
                is_negative = bool(negative.search(normalized_clause))
                is_positive = bool(positive.search(normalized_clause.strip())) and not is_negative
                if is_negative or is_positive:
                    overlap = sum(_contexts_overlap({term}, sentence_terms) for term in question_terms)
                    relevant_rules.append((overlap, is_negative, is_positive, sentence_terms))
    if not relevant_rules:
        return False
    most_specific = max(item[0] for item in relevant_rules)
    source_negative = any(item[1] for item in relevant_rules if item[0] == most_specific)
    source_positive = any(item[2] for item in relevant_rules if item[0] == most_specific)
    if source_negative and source_positive:
        positive_terms = set().union(*(item[3] for item in relevant_rules if item[0] == most_specific and item[2]))
        negative_terms = set().union(*(item[3] for item in relevant_rules if item[0] == most_specific and item[1]))
        return bool(
            positive.search(normalized_answer) and negative.search(normalized_answer)
            and any(term in answer for term in positive_terms - negative_terms)
            and any(term in answer for term in negative_terms - positive_terms)
        )
    if answer_positive and source_negative and not source_positive:
        return False
    if answer_negative and source_positive and not source_negative:
        return False
    return True


def explicit_absence_matches_question(
    question: str, answer: str, excerpts: Iterable[str] | None = None,
) -> bool:
    """A stated missing detail must concern the asked subject and appear in cited text."""
    absent = re.compile(r"정하지\s*않|정해져\s*있지\s*않|정해지지\s*않|명시하지\s*않|기재하지\s*않|규정하지\s*않")
    if not absent.search(answer):
        return True
    generic = {
        "업무", "자료", "보관", "기간", "기한", "시간", "금액", "비용", "한도",
        "얼마", "며칠", "언제", "시점", "기록", "안내", "정확히", "정하지",
    }
    question_topics = _context_terms(question) - generic
    if not question_topics:
        return False
    source_sentences = (
        [sentence for excerpt in excerpts for sentence in re.split(r"[.!?。！？;；\n]+", excerpt) if absent.search(sentence)]
        if excerpts is not None else None
    )
    for sentence in re.split(r"[.!?。！？;；\n]+", answer):
        if not absent.search(sentence):
            continue
        answer_topics = _context_terms(sentence) - generic
        if not _contexts_overlap(question_topics, answer_topics):
            return False
        if source_sentences is not None and not any(
            _contexts_overlap(question_topics, _context_terms(source) - generic)
            and _contexts_overlap(answer_topics, _context_terms(source) - generic)
            for source in source_sentences
        ):
            return False
    return True


def answer_body(value: str) -> str:
    return re.split(r"(?:^|\s)근거\s*원문\s*[:：]", value, maxsplit=1)[0].strip()


def repeats_question(answer: str, question: str) -> bool:
    def comparable(value: str) -> str:
        return re.sub(r"[\s.!?。！？]+", "", value).casefold()

    normalized_answer = comparable(answer)
    normalized_question = comparable(question)
    if normalized_answer == normalized_question:
        return True

    # Small local models sometimes echo a yes/no question and append a
    # contradictory fragment (for example, "...올려도 돼 없습니다."). Treat
    # that as an echo so the retry can repair it instead of showing it as fact.
    if normalized_answer.startswith(normalized_question):
        suffix = normalized_answer[len(normalized_question):]
        if suffix in {"없습니다", "있습니다", "아닙니다", "않습니다"}:
            return True
    return False


def cited_policy_values_support(answer: str, excerpts: Iterable[str], question: str = "") -> bool:
    """Check cited values, limits, relative deadlines, clock periods, and their topic."""
    excerpt_list = list(excerpts)
    if not _preserves_temporal_conditions(question, answer, excerpt_list):
        return False
    claims = list(policy_value_mentions(answer))
    if not claims:
        return True
    answer_contexts = list(_mention_contexts(answer))
    evidence = [
        (mention, context)
        for excerpt in excerpt_list
        for mention, context in zip(policy_value_mentions(excerpt), _mention_contexts(excerpt))
    ]
    evidence_contexts = [
        _context_terms(sentence)
        for excerpt in excerpt_list
        for sentence in re.split(r"[.!?。！？;；\n]+", unicodedata.normalize("NFKC", excerpt))
        if sentence.strip()
    ]
    question_mentions = list(zip(policy_value_mentions(question), _mention_contexts(question))) if question else []
    requested_units = set()
    for pattern, units in _DETAIL_UNIT_QUESTIONS:
        if pattern.search(question):
            requested_units.update(units)
    if _MONEY_DETAIL_QUESTION.search(question):
        requested_units.update({"원", "%"})
    question_terms = _context_terms(question)
    for (claim, relative, period), claim_terms in zip(claims, answer_contexts):
        matches = [
            (mention, context) for mention, context in evidence
            if mention[0] == claim or (not claim[3] and mention[0][:3] == claim[:3])
        ]
        if not matches:
            # A negative scenario answer may state that the user's time is before
            # a documented "after" threshold. That comparison reverses the
            # attached direction while preserving the source's actual rule.
            if _is_supported_negative_clock_comparison(
                (claim, relative, period), answer, question_mentions, evidence,
            ):
                continue
            # A scenario value supplied by the user can be repeated as a premise.
            # It cannot stand in for a policy value the question asks us to find.
            premise_is_in_question = (
                claim[1] not in requested_units
                and any(
                    question_mention[0] == claim
                    and _contexts_overlap(claim_terms, question_context)
                    for question_mention, question_context in question_mentions
                )
            )
            if premise_is_in_question:
                continue
            return False
        if period and not any(mention[2] == period for mention, _context in matches):
            return False
        if relative:
            anchor, direction = relative
            same_anchor = [
                mention[1][1] for mention, _context in matches
                if mention[1] and (mention[1][0].endswith(anchor) or anchor.endswith(mention[1][0]))
            ]
            if same_anchor and direction not in same_anchor:
                return False
        # A matching number elsewhere in a citation is not enough: when the
        # answer or question names a topic, require that topic in the sentence
        # containing the cited number. Generic wording ("한도", "청구 가능")
        # is intentionally ignored so concise paraphrases remain valid.
        topic_terms = claim_terms or question_terms
        if topic_terms:
            if not any(topic_terms.intersection(context) for _mention, context in matches):
                return False
        # If the citation contains a sentence that clearly covers the asked
        # topic, a same-valued fact from a different topic cannot answer it.
        # This catches a valid fact quoted from the wrong policy in a mixed
        # passage (for example, returning the meal cap for a taxi question).
        if question_terms:
            asked_contexts = [context for context in evidence_contexts if _contexts_overlap(question_terms, context)]
            if asked_contexts and not any(
                _contexts_overlap(question_terms, context) for _mention, context in matches
            ):
                return False
    return True
