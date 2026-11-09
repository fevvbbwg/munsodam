# 모노랩 로컬 RAG 평가

`gold_questions.json`은 36개 문항 (답변 가능 24개, 답변 불가 12개)이고, `dev_questions.json`은 12개 개발 문항입니다. 평가 문서는 `docs/`에 둡니다. 검색 정답은 section ID로 지정되어 있습니다.

문서 원본 규칙은 기획서에 적힌 모노랩 휴가·출장비·기기 보안 세 가지뿐입니다. 기획서가 언급한 골드 세트의 원본 파일이 비어 있는 저장소에 없어서 문항을 다시 구성했습니다. 따라서 이 세트는 재현 가능한 프로젝트 평가용이며, 원본 골드 세트와 동일하거나 독립 데이터라고 주장하지 않습니다.

## 실행

프로젝트 README에 따라 Python 가상환경과 두 지정 Ollama 모델을 준비한 뒤, 저장소 루트에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe evaluation/run_evaluation.py --isolated --suite both
```

`--isolated`는 빈 임시 SQLite와 업로드 폴더를 만들고 별도 로컬 포트에서 실제 FastAPI를 실행합니다. 임시 계정에 가상 문서만 등록하며 종료 시 임시 API와 자료를 정리합니다. `--suite dev` 또는 `--suite gold`로 한 세트만 실행할 수도 있습니다.

PostgreSQL/pgvector 통합 평가에는 별도의 Compose 평가 환경과 계정을 사용하세요. `EVAL_EMAIL`, `EVAL_PASSWORD`를 설정한 뒤 `python evaluation/run_evaluation.py --base-url http://localhost:8000 --suite both`를 실행합니다. 연결한 계정에 다른 문서나 내용이 다른 동명의 문서가 있으면 등록 전에 중단합니다. 평가에 필요한 가상 문서가 빠져 있으면 그 계정에 등록합니다.

FastAPI와 별도로 모델·검색 동작을 진단할 수도 있습니다.

```powershell
python evaluation/run_local_ollama_evaluation.py --suite dev
python evaluation/run_local_ollama_evaluation.py --suite gold
```

로컬 직접 평가는 같은 문서·질문과 지정 Ollama 모델을 사용하고, 문서를 메모리에 올려 exact cosine으로 순위를 계산합니다. 답변 생성은 API와 별도의 단일 호출 평가 구현이라 FastAPI의 재시도와 SQLite 정책 발췌 보완 경로를 포함하지 않습니다. 따라서 이 결과는 모델·검색을 살펴보는 보조 진단이며, API 평가 수치와 직접 비교하거나 웹 답변 경로의 성능으로 해석하지 않습니다. PostgreSQL/pgvector SQL이나 웹 API 통합 경로도 검증하지 않습니다. 개발 세트 실행은 `calibration.json`에 선택 임계값과 지표를 저장하며, 골드 실행은 해당 값을 읽기만 합니다. 다만 복합 질문의 모든 주제에 근거가 연결되는지 확인하는 로직은 골드 실행에서 관찰한 부분 답변을 수정하며 추가했습니다. 따라서 같은 질문 세트의 최종 점수는 개발 회귀 결과이지 독립 블라인드 결과가 아닙니다.

기존 세트와 분리한 시설·운영·출장 가상 문서 평가도 실행할 수 있습니다. 기본 15문항 세트는 개발 중 실패 사례를 확인하고 보강하는 데 사용했습니다. `holdout_questions.json`은 같은 새 합성 문서에 대한 별도 질문으로 코드 변경 없이 한 차례 실행했습니다. 자료와 질문이 합성이고 자동 채점도 핵심 문구에 의존하므로, 이 결과를 실제 사내 문서에 대한 독립 블라인드 성능으로 해석하지 않습니다.

추가한 `nuance_questions.json`은 재택·연장근무 식비, 제출 기산일, 장애 대응, 시각 경계, 초과 승인처럼 비슷한 정책 값을 구별해야 하는 20문항 개발 도전 세트입니다. 이 세트로 실패 사례를 찾고 코드를 조정했으므로 독립 홀드아웃이 아닙니다. 특정 질문만 재현할 때 `--ids N03,N11`처럼 ID를 지정할 수 있습니다.

```powershell
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/holdout_questions.json
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/injection_questions.json --docs evaluation/challenge/injection_docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/nuance_questions.json --docs evaluation/challenge/nuance_docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/independent_v6_questions.json --docs evaluation/challenge/independent_v6/docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/independent_v7_questions.json --docs evaluation/challenge/independent_v7/docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/independent_v8_questions.json --docs evaluation/challenge/independent_v8/docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/contrastive_v9_questions.json --docs evaluation/challenge/contrastive_v9/docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/negation_v10_questions.json --docs evaluation/challenge/negation_v10/docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/long_document_v11_questions.json --docs evaluation/challenge/long_document_v11/docs
.\.venv\Scripts\python.exe evaluation/run_challenge_evaluation.py --questions evaluation/challenge/docx_v12_questions.json --docs evaluation/challenge/docx_v12/docs
```

통합 스크립트는 API가 `/api/ready`에서 DB·벡터 기능·지정 모델 상태를 확인한 다음 `docs/`의 문서를 필요할 때만 등록·인덱싱합니다. 모든 문항을 키워드·벡터·하이브리드 방식으로 검색하고, `/api/chat`에서 실제 웹 서비스의 답변·출처·보류 경로를 측정합니다. JSON 결과는 `results/`에 남습니다. 개발 세트로 임계값을 정하고, 골드 세트는 임계값 계산에는 사용하지 않습니다. 단, 골드 문항에서 관찰한 복합 질문 오류를 코드에서 수정했으므로 골드 수치는 blind holdout 성능으로 해석하지 않습니다.

2026-11-08 최신 격리 SQLite API 회귀는 [골드 보고서](results/gold_20261108_214008.json)와 [개발 보고서](results/dev_20261108_213902.json)에 기록했습니다. 골드는 Recall@5·답변·출처 24/24, 보류 12/12였고 응답 중앙값 1,437.0ms였습니다. 개발 세트는 답변·출처·검색 10/10, 보류 2/2, 중앙값 1,183.7ms였습니다. 기존 세트는 개발 중 보강에 사용했으며 독립 블라인드 결과가 아닙니다.

시설·운영 규정 [회귀 15문항](results/release_validation_20261108_170937.json)은 검색·답변·출처 14/14, 답변 불가 1/1 보류였습니다. 자동 채점의 V02에는 의미가 같은 “실험실에 있는 동안” 표현을 허용하도록 보완했습니다. 재택·연장근무·기산일·경계값 [뉘앙스 20문항](results/nuance_20261108_171334.json)은 검색·답변·출처 19/19, 보류 1/1이었습니다. 문서 속 지시문 회귀 [3문항](results/injection_20261108_171344.json)은 정책 질문 1/1, 민감 정보 요청 보류 2/2였습니다.

AI 답변 경로를 다듬으며 기한 질문에서 다른 행동의 날짜가 섞이는 문제, 단위·수치는 맞아도 요청한 주제가 빠지는 복합 답변, 문서의 연락 담당자를 승인자로 바꾸어 말하는 추론을 보강했습니다. 섹션 제목은 본문 문장과 분리해 검증하며, 복합 답변 복구는 질문별로 직접 관련된 원문 문장만 선택합니다. “금지하지 않는다” 같은 이중 부정을 금지로 읽지 않도록 하고, 구어체 질문의 동사를 원문 규칙과 연결합니다. 미기재 답변은 같은 주제의 명시적 미기재 문장이 인용 원문에 실제 있을 때만 허용하며, 단순히 찾지 못한 항목은 계속 보류합니다. 답변에 나온 영문 서비스명·식별자·이메일 주소 전체가 인용 원문에 없으면 재생성 후에도 보류합니다.

모델의 첫 초안이 검증에 실패하면 재시도 지침에 그 실패 유형을 넣습니다. 누락 항목, 수치·조건 불일치, 승인 주체 추론, 서비스명 불일치, 허용 방향 오류, 질문과 무관한 미기재 주장을 구체적으로 알려 같은 검증을 다시 수행합니다. 두 번째 초안도 통과하지 못하면 보류하거나 검증 가능한 원문 문장으로 복구합니다.

변경 중 진단에 사용한 [독립 v6 개발 세트](results/independent_v6_20261108_193154.json)는 답변 가능 질문 10/10 검색·답변·인용, 답변 불가 질문 2/2 보류였습니다. 새 합성 문서 2개와 질문 12개의 [v7 회귀](results/independent_v7_20261108_213756.json)는 검색·답변·인용 10/10, 보류 2/2, 중앙 응답 1,518.1ms였습니다. 허용·금지 규칙이 위치에 따라 달라지는 문서와 8개 질문을 새로 작성한 [v8 개발 세트](results/independent_v8_20261108_213814.json)는 검색·답변·인용 6/6, 보류 2/2, 중앙 응답 1,077.9ms였습니다. v8에서 찾은 허용 범위 질문의 보류, 다른 주제의 명시적 미기재 인용, 단답 뒤에 무관한 원문을 붙이는 오류를 수정했습니다. 허용·금지 결론이 뒤집힌 생성 답변을 막는 테스트도 더했습니다. 자동 채점에서 뜻이 같은 허용 표현을 인정하도록 v8 질문의 핵심 구절 목록도 조정했습니다. 따라서 v8 최종 점수는 튜닝한 개발 회귀 결과입니다. 모든 세트는 직접 작성한 작은 합성 평가이며 대규모 독립 맹검, 실제 사내 문서 일반화, 보안 감사를 입증하지 않습니다.

v8 [첫 실행](results/independent_v8_20261108_210242.json)은 자동 답변 3/6, 보류 1/2였습니다. 답변 오답 3건 중 2건은 같은 뜻의 “찍을 수 있습니다/없습니다”를 채점기가 놓친 사례였고, 실제 오류는 장소별 허용 범위를 묻는 질문의 보류와 사진 기한 질문에 다른 자료의 미기재 문장을 답한 사례였습니다. 승인 답변에 무관한 문장이 붙는 문제도 발견해 원문 선택을 줄였습니다.

같은 최종 코드의 문서 지시문 회귀 [결과](results/injection_20261108_212551.json)는 일반 정책 질문 1/1을 답하고, 근거 없는 개인 정보 요청과 문서 속 지시를 따른 요청 2/2를 보류했습니다. 이 소규모 확인은 보안 평가나 프롬프트 인젝션에 대한 보장을 대신하지 않습니다.

허용과 금지가 한 문장에 묶인 경우에는 대조 접속어로 절을 구분해 질문한 장소의 규칙을 확인합니다. 해당 변경 뒤 새로 작성한 [v9 문서와 질문 6개](results/contrastive_v9_20261108_213831.json)를 로컬 Ollama를 사용하는 격리 API에 재실행했습니다. 검색·답변·인용 5/5, 근거 없는 승인 기한 보류 1/1, 응답 중앙값 1,143.8ms였습니다. 질문과 문서는 자체 작성한 소규모 합성 개발 자료이며, 범위 질문을 추가한 뒤 재실행한 결과입니다.

이중 부정, 허용되지 않음, 이메일 전체 주소, 명시적 미기재를 담은 [v10 문서와 질문 5개](results/negation_v10_20261108_214317.json)를 새로 만들어 한 번 실행했습니다. 검색·답변·인용 4/4, 근거 없는 승인자 질문 보류 1/1, 응답 중앙값 1,182.2ms였습니다. 답변 본문도 직접 확인했지만 작은 자체 작성 합성 세트입니다.

긴 섹션을 자를 때 글자 수만 맞추는 대신 문장 끝을 우선하고, 문장 끝이 없으면 단어 경계를 선택합니다. `CHUNK_CHARS=1000`, `CHUNK_OVERLAP=150`에서 핵심 규칙을 1,000자 경계 부근에 둔 [v11 장문 합성 문서 3문항](results/long_document_v11_20261108_214726.json)은 검색·답변·인용 2/2, 근거 없는 정기 교체 주기 보류 1/1, 응답 중앙값 1,789.7ms였습니다. 규칙 문장은 인접한 두 구간에 온전히 남았습니다. 이 작은 합성 세트만으로 다양한 실제 PDF/DOCX 장문의 성능을 일반화하지 않습니다.

새 구간 분할은 새로 업로드하는 문서에 적용됩니다. 기존 문서의 `다시 처리`는 기존 구간의 임베딩만 재생성하므로 이미 등록된 문서의 구간 경계는 유지됩니다. 구간 ID를 바꾸면 저장한 근거 링크가 어긋날 수 있어 자동 재분할은 하지 않습니다.

평가 도구는 TXT, DOCX, PDF 등록을 지원하고, `파일명::상위 제목 / 하위 제목` 형태로 DOCX 구간의 정답 출처를 지정할 수 있습니다. 계층 제목이 있는 [v12 DOCX 합성 문서 4문항](results/docx_v12_20261108_215304.json)은 실제 업로드·임베딩·질의 API에서 검색·답변·인용 3/3, 근거 없는 수수료 질문 보류 1/1, 응답 중앙값 1,178.4ms였습니다. 같은 하위 제목을 가진 서로 다른 상위 항목을 구분한 소규모 자체 평가입니다.

추가 [이전 독립 v5 결과](results/independent_v5_20261108_171046.json)는 답변 가능한 8개 중 자동 핵심 문구 채점 7/8, 검색·출처 8/8, 답변 불가 보류 3/3이었습니다. 의미가 같은 다른 표현을 자동 채점기가 놓치는 사례가 있어 핵심 문구 목록을 검토했습니다. 추가 [발전 회귀 12문항](results/independent_v4_20261108_165319.json)은 검색·인용 10/10, 보류 2/2였으며 자동 답변 8/10 중 두 건은 의미상 맞는 허용·금지 표현을 채점기가 놓친 사례였습니다.

앞선 [개발 도전 15문항](results/challenge_20261108_160859.json)과 [초기 뉘앙스 실행](results/nuance_20261108_160947.json)은 이전 기준 결과로 남겨 둡니다. 모든 추가 세트는 가상 문서 기반이며 실제 사내 자료 일반화, 대규모 성능, 보안 감사를 증명하지 않습니다. 결과 JSON에는 지정 모델 준비 상태와 자료 SHA-256이 기록됩니다.

이번 회귀에서는 인용 문서의 숫자와 단위뿐 아니라 ‘복귀 후 7일’을 ‘복귀 전 7일’로 뒤집거나 오전·오후를 혼동한 답, 금액 질문에 시간 조건을 대신 답하는 경우도 재생성 또는 보류하도록 보강했습니다. 숫자가 인용에 있더라도 그 값이 속한 문장과 질문의 정책 항목이 맞지 않으면 거부합니다. 질문을 그대로 반복하거나 질문 뒤에 깨진 긍정·부정 꼬리를 붙인 답도 재시도 대상으로 분류합니다. 복합 답변의 수치 검증이 실패하면 주제별로 가까운 원문을 선택해 같은 검증을 다시 수행하고, 모든 부분이 확인될 때만 답변을 복구합니다. 문서가 보관 기한을 명시적으로 정하지 않았다고 밝히면 그 원문을 출처와 함께 답하고, 단지 해당 금액이나 기간이 빠져 있으면 보류합니다. 식비 25,000원과 택시비 30,000원이 함께 있을 때 택시비를 25,000원으로 잘못 연결한 답도 막습니다. 이 어휘 문맥 검사는 한국어 동의어 검증을 완전히 대체하거나 문장 전체의 의미를 증명하지는 않습니다. 자동 평가 핵심 구절의 동의어 오탐을 확인해 일부 허용 표현을 보완했습니다. [이전 보고서](results/gold_20261108_000905.json)도 비교용으로 유지합니다.

11월 7일의 개발 보고서를 답변 본문만으로 재채점하면 8/10이었습니다. 원문 발췌가 연차의 근무일 기준 오류와 출장 승인자 누락을 가렸습니다. 수치 검증과 승인 규칙 처리를 추가한 뒤 두 질문 모두 답변 본문으로 통과했습니다. 이전 보고서의 답변 정답성에는 당시 답변 뒤에 덧붙인 발췌가 포함될 수 있습니다.

별도 확인 질문에서는 출장비 정산 기한을 14일로 제시하자 원문에 적힌 복귀 후 7일을 답했습니다. 식비 한도를 5만 원으로 제시한 질문과 문서에 없는 위약금 질문은 둘 다 보류했습니다. 정해진 식비 한도와 달리 틀린 숫자가 포함된 질문에서는 실제 한도를 제시하지 못할 수 있습니다.

개선 전 개발 문항 D10은 휴가 신청과 기기 보안을 함께 묻는 질문에서 계획 연차 대신 당일 병가를 인용했습니다. 여러 주제에 공통으로 붙은 “알아둘 점”도 주제별 검색 대상으로 인식하도록 고친 뒤, 계획 연차의 3근무일과 화면 잠금의 5분 기준을 각각 답하고 해당 구간을 인용했습니다. 복합 질문의 주제별 임베딩을 한 요청으로 묶은 뒤에도 두 세트의 품질 지표를 유지했습니다.

마지막 회귀에서는 단일 주제 답변에도 상위 5개 근거를 제공하고, 인접한 무관 규칙의 정확한 시각이 시간 경계 보완을 막지 않도록 수정했습니다. 이 수정은 출장비 신청 표현과 명시된 정산 기한만 연결하며 해당 기한을 찾지 못하면 답변을 만들지 않습니다. 수정 전에는 개발 문항 D04와 골드 문항 G03이 불필요하게 보류됐고, 수정 후 두 문항 모두 필요한 문서 구간을 인용해 통과했습니다.

`gold_20261101_040758.json`과 `dev_20261101_040839.json`은 이전 SQLite API 기준선입니다. `*_local_*.json` 파일은 메모리에서 Ollama를 직접 호출한 보조 진단 기록입니다.

최신 후속 보강에서는 같은 인용에 질문한 기간이 문서에서 정해지지 않았다는 사실과 다른 주제의 숫자가 함께 있는 경우, 무관한 숫자를 답하지 않고 미기재 문장을 출처와 함께 반환합니다. 얼리기·신청·반납 등 질문한 행동의 기한 조건을 다른 행동의 기한과 구분합니다. 직접 허용 여부 질문에 모델이 절차만 말한 경우 원문 금지 문장과 질문에 필요한 인접 기한을 붙입니다. 전체 서버 테스트 76개와 최신 지정 모델 회귀 결과는 위 보고서에서 확인할 수 있습니다. 이 규칙 기반 보완은 완전한 한국어 의미 판정이 아닙니다.

## 지표

- Recall@5: 답변 가능한 각 질문에 필요한 모든 gold section이 상위 5개 검색 결과에 있는 비율
- 검색 비교: 동일 질문의 키워드·벡터·RRF 하이브리드 검색 Recall@5
- 답변 정답성: 답변 가능한 질문 중 보류하지 않고 답변 본문에 지정한 핵심 사실 구절을 모두 포함한 비율. 이전 API가 본문 뒤에 붙이던 원문 발췌와 별도 출처 카드는 채점 대상에서 제외
- 출처 정확도: 답변 가능한 질문 중 필수 정답 section을 모두 인용하고, 데이터에 지정된 허용 범위 밖의 section은 인용하지 않은 비율
- 보류 정확도: 답변 불가 질문 중 보류한 비율
- 응답 시간: `/api/chat` 호출의 중앙값; 질문 임베딩과 답변 생성, 출처 조립을 포함

기획서 목표는 각각 85%, 80%, 90%, 90%, 중앙값 10초입니다. 핵심 구절 자동 판정은 동의 표현을 놓칠 수 있으므로 실패 답변도 결과 파일에서 직접 검토해야 합니다.
