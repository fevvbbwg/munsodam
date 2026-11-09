import { ArrowLeft, ArrowUpRight, Check, ChevronDown, FileText, MessageCircleQuestion, Search, ShieldCheck, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { createTextQueryMatcher } from '../textQuery.mjs'
import { shouldClearSearchOnEscape } from '../keyboardInput.mjs'

type UserGuideProps = {
  onBack: () => void
  onOpenSearch: () => void
  onOpenDocuments: () => void
}

const steps = [
  {
    number: '01',
    title: '파일을 추가합니다',
    description: 'PDF, DOCX, TXT를 문서함에 올립니다. 한 파일은 20MB까지 등록할 수 있습니다.',
    icon: <FileText size={17} />,
  },
  {
    number: '02',
    title: '찾을 내용을 입력합니다',
    description: '문서에 나온 표현을 몰라도 괜찮습니다. 찾고 싶은 상황이나 질문을 자연스럽게 적어 보세요.',
    icon: <Search size={17} />,
  },
  {
    number: '03',
    title: '찾은 문서에서 확인합니다',
    description: '근거 카드에서 “앞뒤 문맥 보기”를 열어 이웃 구간을 확인하세요. 문서 이름을 누르면 해당 원문 위치로 이동합니다.',
    icon: <Check size={17} />,
  },
]

type GuideQuestion = { title: string; body: string; action?: string; actionTarget?: 'search' | 'documents' }

const questions: GuideQuestion[] = [
  {
    title: '계정을 만들면 기존 문서는 어떻게 되나요?',
    body: '회원가입을 통해 계정을 만들 수 있습니다. 현재 이 컴퓨터의 자료실에 이미 등록된 문서는 첫 계정에 연결해 유지하고, 이후 가입한 계정은 자기 문서함을 따로 사용합니다.\n\n로그인 아이디는 가입 이메일입니다. 로그인 화면의 아이디 찾기에서 미리 발급한 복구 코드로 확인할 수 있고, 계정 관리에서 비밀번호 변경과 복구 코드 발급을 할 수 있습니다.\n\n비밀번호를 잊었을 때는 메일 재설정 링크나 저장해 둔 복구 코드를 사용하세요. 이메일 재설정은 메일 발송 설정이 필요합니다.',
  },
  {
    title: '최근 검색과 즐겨찾기는 어디서 보나요?',
    body: '넓은 화면에서는 상단의 검색 기록 메뉴를, 휴대폰에서는 더보기 메뉴를 열어 최근 질문을 최대 20개까지 다시 실행할 수 있습니다. 질문이나 문서 이름으로 찾고, 요청 유형과 검색 방식으로 좁혀 보세요.\n\n기록은 날짜별로 묶여 있습니다. 기록 하나만 지우거나 전체를 비울 수 있고, 연결된 문서를 사용할 수 없으면 전체 문서에서 다시 찾도록 안내합니다.\n\n즐겨찾기에는 별표를 누른 문서가 모입니다. 이름·형식·처리 상태로 찾고 정렬하거나, 문서함에서 즐겨찾기 필터를 사용할 수 있습니다.',
  },
  {
    title: '중요한 근거 문장을 따로 보관할 수 있나요?',
    body: '검색 결과나 답변의 발췌 옆에서 “저장”을 누르면 저장한 근거에 모입니다. 넓은 화면에서는 상단 메뉴, 휴대폰에서는 더보기 메뉴에서 열 수 있으며 최대 200개까지 보관합니다.\n\n문서명·위치·질문·발췌 내용으로 다시 찾고, “앞뒤 문맥 보기”를 펼치면 저장 당시 질문에 일치하는 표현이 강조됩니다. 원문을 읽고 목록에 돌아오면 검색어, 정렬과 페이지를 이어서 볼 수 있습니다. 삭제한 항목은 8초 안에 되돌릴 수 있습니다.\n\nMarkdown 내보내기는 조건에 맞는 근거와 출처 링크를 저장합니다. 저장한 발췌는 이 브라우저에 보관됩니다.',
  },
  {
    title: '열어 둔 문서 안에서 다시 찾을 수 있나요?',
    body: '문서 상세의 “이 문서에서 다시 찾아보세요”에 단어나 문장을 입력하면 현재 문서의 추출 텍스트에서 관련 구간을 찾습니다. Ctrl+F (Mac에서는 ⌘F)로 입력란에 바로 갈 수 있고, 결과를 선택하면 해당 위치로 이동합니다.\n\n결과는 관련도 순으로 10개씩 표시합니다. 문서 구간이 12개보다 많으면 목차가 화면 위에 남고, 읽는 위치에 따라 현재 절을 표시합니다. 문서 끝에서는 최근에 열어본 다른 문서로 이어갈 수 있습니다.',
  },
  {
    title: '문서의 특정 구간을 주제로 질문할 수 있나요?',
    body: '문서 상세에서 구간 위의 “질문”을 누르면 해당 제목이나 페이지를 주제로 한 질문 초안이 입력되고, 검색 범위가 그 문서로 지정됩니다. 검색하거나 답변을 요청하기 전에 문장을 확인하고 필요한 부분을 고칠 수 있습니다.',
  },
  {
    title: '검색 방식은 어떻게 다른가요?',
    body: '기본 검색은 문서에 적힌 단어와 비슷한 내용을 함께 찾습니다. 필요하면 비슷한 내용만 찾거나 정확한 단어로 검색할 수 있습니다.\n\n답변 보기는 문서에서 찾은 근거로 답하고, 뒷받침할 내용이 없으면 답을 보류합니다. 답변 아래에서 “간단히” 또는 “자세히”를 고르면 같은 질문을 해당 분량으로 다시 답합니다.\n\n의미 검색이나 답변을 사용할 수 없을 때는 가능한 검색 방법을 안내합니다.',
    action: '검색해 보기',
    actionTarget: 'search',
  },
  {
    title: '검색 결과를 한 번에 저장할 수 있나요?',
    body: '검색 결과가 표시되면 검색 결과 영역 위쪽의 “근거 내보내기”를 눌러 현재 표시된 발췌를 Markdown 파일로 내려받을 수 있습니다. 파일에는 질문, 검색 범위와 방식, 문서 이름, 페이지나 구간 위치, 원문 링크가 포함됩니다. 답변 보기에서는 답변과 근거 문서를 함께 Markdown으로 저장할 수 있습니다.',
  },
  {
    title: '특정 문서 안에서만 검색할 수 있나요?',
    body: '검색 화면의 “검색 범위”에서 전체 문서나 문서 하나를 선택할 수 있습니다. 검색 결과나 답변을 보고 있을 때 범위를 바꾸면 같은 질문을 새 범위에서 다시 찾습니다. 문서 하나 안에서 결과가 없거나 답변이 보류되면, 다른 검색 가능한 자료가 있을 때 “전체 문서에서 다시 찾기”를 선택할 수 있습니다. 최근 문서 목록의 돋보기로 문서 범위를 바로 선택할 수도 있습니다.',
    action: '검색 범위 선택하기',
    actionTarget: 'search',
  },
  {
    title: '문서 주제 버튼을 누르면 바로 검색되나요?',
    body: '검색 화면의 질문 예시는 실제로 열어본 문서나 즐겨찾기에서 가져옵니다. 누르면 해당 문서를 범위로 고르고 주제에 맞는 질문을 채워 줍니다. 문장을 확인하고 고친 뒤 검색할 수 있습니다.\n\n찾은 문장을 보려면 “검색”, 근거를 바탕으로 정리하려면 “답변 보기”를 누르세요. 휴대폰에서는 “문서 구간으로 질문 만들기”나 “내 문서” 탭에서 주제를 고를 수 있습니다.',
  },
  {
    title: '답변 대신 찾을 수 없다고 나와요.',
    body: '질문과 가까운 근거가 없거나 문서 내용만으로 답을 확정하기 어려우면 답변을 보류합니다. 한 문서만 범위로 골랐다면 다른 검색 가능한 자료 전체로 범위를 넓혀 다시 찾아볼 수 있습니다. 문서함에 관련 자료가 있는지 확인하고, 질문에 문서의 주제나 용어를 덧붙여 다시 시도해 보세요.',
    action: '질문 다시 입력하기',
    actionTarget: 'search',
  },
  {
    title: '문서가 검색되지 않아요.',
    body: '“파일을 읽는 중” 또는 “준비 중”이면 처리가 끝날 때까지 기다려 주세요.\n\n“파일을 읽지 못했어요”면 저장된 원본을 다시 읽고, “다시 처리 필요”면 검색 준비를 다시 시도하세요. 같은 오류가 이어지면 PDF·DOCX·TXT 형식과 20MB 제한, 파일 손상 여부를 확인해 수정본을 올려 주세요.\n\n검색 준비가 끝났는데도 찾지 못하면 문서에 적힌 표현을 정확한 단어 방식으로 검색해 보세요.',
    action: '문서함에서 상태 확인',
  },
  {
    title: '문서를 여러 개 선택해 정리할 수 있나요?',
    body: '문서함에서 “여러 문서 선택”을 누른 뒤 필요한 파일을 고르세요. Shift를 누르고 첫 문서와 마지막 문서를 선택하면 그 사이 파일도 함께 선택됩니다. 선택한 문서를 즐겨찾기에 한꺼번에 추가하거나 해제할 수 있습니다.\n\n선택 삭제를 누르면 파일 이름과 삭제 범위를 먼저 확인합니다. 삭제한 원본과 추출 텍스트는 복구할 수 없습니다.',
  },
  {
    title: '즐겨찾기한 문서는 어디서 보나요?',
    body: '검색 화면의 내 문서 목록에서 별표를 누르면 즐겨찾기에 추가됩니다. 문서함에서는 즐겨찾기 필터로 모아볼 수 있습니다. 별표 선택은 이 브라우저에 저장되며, 브라우저 저장 공간을 지우면 함께 삭제됩니다.',
  },
  {
    title: '예시 문서를 추가하면 실제 자료로 검색되나요?',
    body: '예시 문서는 기능을 살펴보기 위한 가상 자료입니다. 버튼을 누르면 문서함에 등록되어 실제 검색과 답변에 사용되며, 필요 없으면 문서함에서 삭제할 수 있습니다.',
  },
  {
    title: '스캔한 PDF도 읽을 수 있나요?',
    body: '현재는 PDF에 텍스트가 포함된 문서만 처리합니다. 종이를 스캔한 이미지 PDF의 글자를 읽는 OCR은 지원하지 않습니다.',
  },
  {
    title: '문서는 어디에 저장되나요?',
    body: '문서와 질문은 검색 처리를 위해 문서담에 전달됩니다. 검색 기록은 서버에 저장하지 않고, 즐겨찾기·최근 문서·저장한 발췌는 계정별 브라우저 저장 공간에 보관합니다.\n\n원문 문서를 삭제해도 저장한 발췌는 남지만 원문으로 이동할 수 없습니다. 브라우저 저장 공간을 사용할 수 없으면 기록이나 발췌가 현재 탭에서만 유지될 수 있습니다.\n\n진행 중인 검색어와 결과, 원문에서 강조할 질문은 주소에 넣지 않습니다. 새로고침하거나 뒤로·앞으로 이동해도 이 탭에서 이어 볼 수 있습니다.',
  },
]

export default function UserGuide({ onBack, onOpenSearch, onOpenDocuments }: UserGuideProps) {
  const [faqQuery, setFaqQuery] = useState('')
  const faqInputRef = useRef<HTMLInputElement>(null)
  const visibleQuestions = useMemo(() => {
    const matchesQuestion = createTextQueryMatcher(faqQuery)
    return questions.filter(question => matchesQuestion([question.title, question.body]))
  }, [faqQuery])
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  const searchShortcut = isMac ? '⌘ K' : 'Ctrl K'
  const documentFindShortcut = isMac ? '⌘ F' : 'Ctrl F'

  return (
    <section className="guide-page">
      <div className="guide-hero">
        <div className="guide-hero-copy">
          <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> 검색으로 돌아가기</button>
          <span className="page-kicker">사용 안내</span>
          <h1 tabIndex={-1}>파일을 올리고, 찾고,<br />원문에서 확인하세요.</h1>
          <p>문서 올리는 방법과 검색 결과가 기대와 다를 때 확인할 내용을 모았습니다.</p>
          <button className="button-primary" onClick={onOpenDocuments}>내 문서 열기 <ArrowUpRight size={14} /></button>
        </div>
        <aside className="guide-shortcuts" aria-label="빠른 키보드 단축키">
          <div className="guide-shortcuts-heading">
            <strong>자주 쓰는 단축키</strong>
            <span>화면을 옮기지 않고 바로 열기</span>
          </div>
          <div className="guide-shortcut-list">
            <article>
              <kbd>{searchShortcut}</kbd>
              <div><strong>질문 바꾸기</strong><span>어느 화면에서든 입력란으로 이동해 기존 질문을 선택합니다.</span></div>
            </article>
            <article>
              <kbd>{documentFindShortcut}</kbd>
              <div><strong>문서 안에서 다시 찾기</strong><span>상세 화면의 현재 문서 검색을 엽니다.</span></div>
            </article>
          </div>
        </aside>
      </div>

      <section className="guide-section" aria-labelledby="guide-steps-title">
        <div className="guide-section-heading">
          <span className="section-overline">사용 순서</span>
          <h2 id="guide-steps-title">세 단계로 시작합니다</h2>
        </div>
        <div className="guide-steps">
          {steps.map(step => (
            <article key={step.number}>
              <div className="guide-step-top"><span>{step.number}</span><i>{step.icon}</i></div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section guide-questions" aria-labelledby="guide-questions-title">
        <div className="guide-section-heading">
          <span className="section-overline">도움말</span>
          <h2 id="guide-questions-title">자주 묻는 질문</h2>
        </div>
        <div className="guide-faq-tools">
          <label className="guide-faq-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              ref={faqInputRef}
              value={faqQuery}
              onKeyDown={event => {
                if (!shouldClearSearchOnEscape(event.nativeEvent, Boolean(faqQuery))) return
                event.preventDefault()
                setFaqQuery('')
              }}
              onChange={event => setFaqQuery(event.target.value)}
              placeholder="제목이나 내용에서 단어 찾기"
              aria-label="도움말 검색"
            />
            {faqQuery && <button type="button" onClick={() => {
              setFaqQuery('')
              window.requestAnimationFrame(() => faqInputRef.current?.focus())
            }} aria-label="도움말 검색어 지우기"><X size={14} aria-hidden="true" /></button>}
          </label>
          <span role="status" aria-live="polite">{faqQuery.trim() ? `${visibleQuestions.length}개 항목` : `전체 ${questions.length}개 항목`}</span>
        </div>
        <div className="guide-accordion">
          {visibleQuestions.map(question => (
            <details key={question.title}>
              <summary><MessageCircleQuestion size={16} /><span>{question.title}</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <div className="guide-answer">
                {question.body.split(/\n{2,}/u).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                {question.action && <button className="guide-answer-action" type="button" onClick={question.actionTarget === 'search' ? onOpenSearch : onOpenDocuments}>{question.action}<ArrowUpRight size={13} aria-hidden="true" /></button>}
              </div>
            </details>
          ))}
        </div>
        {visibleQuestions.length === 0 && <div className="guide-faq-empty">
          <div className="guide-faq-empty-copy" role="status" aria-live="polite">
            <strong>일치하는 도움말이 없어요.</strong>
            <span>짧은 단어로 다시 찾거나, 검색어를 지우고 전체 항목을 살펴보세요.</span>
          </div>
          <button type="button" onClick={() => {
            setFaqQuery('')
            window.requestAnimationFrame(() => faqInputRef.current?.focus())
          }}>검색어 지우기</button>
        </div>}
      </section>

      <aside className="guide-privacy"><ShieldCheck size={17} /><p><strong>원문 근거를 직접 살펴보세요.</strong><span>답변이 있어도 중요한 결정 전에는 연결된 원문과 발췌 내용을 확인하는 것이 좋습니다.</span></p></aside>
    </section>
  )
}
