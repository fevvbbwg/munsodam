import { Fragment, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  Braces,
  BookOpen,
  Check,
  Copy,
  ChevronDown,
  Database,
  FileUp,
  ListChecks,
  Network,
  ShieldCheck,
  Timer,
  Files,
  ScanSearch,
  RotateCcw,
  Search,
  FileText,
} from 'lucide-react'

type ProjectOverviewProps = {
  onBack: () => void
  onOpenDocuments: () => void
  onTryExample: () => void
  canTryExample: boolean
  exampleActionLabel: string
}

const architecture = [
  {
    step: '01',
    title: '문서 등록',
    description: 'PDF, DOCX, TXT에서 페이지와 제목 정보를 살려 텍스트를 추출합니다. DOCX는 상위·하위 제목도 함께 기록합니다.',
    icon: <FileUp size={18} />,
  },
  {
    step: '02',
    title: '구간과 임베딩',
    description: '문서를 작은 구간으로 나누고 embeddinggemma로 768차원 벡터를 만듭니다.',
    icon: <Braces size={18} />,
  },
  {
    step: '03',
    title: '관련 문서 검색',
    description: '의미·키워드·하이브리드 방식으로 질문과 가까운 근거를 찾습니다.',
    icon: <Database size={18} />,
  },
  {
    step: '04',
    title: '답변과 출처',
    description: 'qwen3:4b-instruct의 답을 항목·수치·기한·허용 여부·이름까지 인용 원문과 대조합니다. 틀린 항목은 구체적으로 알려 한 번 더 답하게 하고, 끝내 확인되지 않으면 보류합니다.',
    icon: <BookOpen size={18} />,
  },
]

const metrics = [
  { label: 'Recall@5', result: '24 / 24', detail: '100% · 목표 85%', progress: 100 },
  { label: '답변 정답성', result: '24 / 24', detail: '100% · 목표 80%', progress: 100 },
  { label: '출처 정확도', result: '24 / 24', detail: '100% · 목표 90%', progress: 100 },
  { label: '보류 정확도', result: '12 / 12', detail: '100% · 목표 90%', progress: 100 },
  { label: '중앙 응답 시간', result: '1.44초', detail: '목표 10초 이하', progress: 86 },
]

const principles = [
  {
    title: '질문한 주제마다 근거를 확인',
    description: '복합 질문을 주제별로 검색하고 각 답변 항목을 원문과 확인합니다. 숫자·기한, 허용 방향, 승인 주체, 서비스명도 검사합니다.',
    icon: <ListChecks size={18} />,
  },
  {
    title: '로컬 모델만 사용',
    description: '답변은 qwen3:4b-instruct, 임베딩은 embeddinggemma로 처리합니다. 외부 유료 AI API로 대체하지 않습니다.',
    icon: <ShieldCheck size={18} />,
  },
  {
    title: '미기재와 미확인을 구분',
    description: '비용이나 기간의 미기재는 같은 주제의 원문이 명시할 때만 답합니다. 승인 주체나 서비스명을 문서에서 확인할 수 없으면 답변을 보류합니다.',
    icon: <Timer size={18} />,
  },
]

const workflows = [
  {
    title: '긴 문서도 필요한 곳부터',
    description: '상세 화면은 텍스트를 40개 구간씩 나눠 보여줍니다. 12개가 넘는 구간에 제목이 둘 이상 있으면 목차가 나타나고, 원하는 곳으로 바로 이동할 수 있습니다.',
    icon: <Files size={17} />,
  },
  {
    title: '검색 결과에서 원문으로',
    description: '근거 카드에서 앞뒤 문맥을 펼치고, 필요하면 해당 원문 구간으로 이동합니다. 중요한 문장은 저장해 다시 볼 수 있습니다.',
    icon: <ScanSearch size={17} />,
  },
  {
    title: '실패한 검색 준비 다시 시도',
    description: '파일 읽기 실패는 보관된 원본으로 다시 읽고, 읽기는 끝났지만 검색 준비가 실패한 문서는 임베딩을 다시 만들 수 있습니다.',
    icon: <RotateCcw size={17} />,
  },
]

const nextChecks = [
  {
    title: '팀 배포 전 조직 정책',
    description: '이메일 로그인과 세션 보호를 제공하고 문서는 계정 소유자 기준으로 분리합니다. 조직·역할별 공유 정책과 접근 감사 기록은 실제 팀 배포 전에 추가해야 합니다.',
    icon: <ShieldCheck size={18} />,
  },
  {
    title: '스캔 PDF는 별도 범위',
    description: '지금은 PDF에 포함된 텍스트를 추출합니다. 이미지로 된 문서까지 지원하려면 로컬 OCR의 정확도와 페이지 연결을 따로 설계하고 평가해야 합니다.',
    icon: <FileUp size={18} />,
  },
  {
    title: '새 문서로 다시 평가',
    description: '허용·금지 조건과 미기재 주제를 확인하는 새 합성 질문 8개로 실패를 찾아 수정했습니다. 개발 세트이므로 실제 문서 성능은 따로 측정해야 합니다.',
    icon: <ListChecks size={18} />,
  },
]

export default function ProjectOverview({ onBack, onOpenDocuments, onTryExample, canTryExample, exampleActionLabel }: ProjectOverviewProps) {
  const [commandCopyStatus, setCommandCopyStatus] = useState<'copied' | 'failed' | ''>('')
  const evaluationCommand = 'python evaluation/run_evaluation.py --isolated --suite gold'

  async function copyEvaluationCommand() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(evaluationCommand)
      setCommandCopyStatus('copied')
    } catch {
      setCommandCopyStatus('failed')
    }
  }

  return (
    <section className="project-page">
      <div className="project-hero">
        <div className="project-hero-copy">
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={16} /> 서비스로 돌아가기
          </button>
          <span className="page-kicker">문서담 프로젝트</span>
          <h1 tabIndex={-1}>
            사내 문서를
            <br />
            필요한 순간에<span className="project-mobile-title-break"><br /></span>{' '}찾을 수 있게.
          </h1>
          <p>
            문서를 올리면 내용을 구간별로 정리하고, 질문과 가까운 원문을 찾아 답변과 함께
            보여주는 로컬 문서 검색 서비스입니다.
          </p>
          <div className="project-tags">
            <span>React · FastAPI</span>
            <span>Ollama 로컬 모델</span>
            <span>외부 AI API 미사용</span>
          </div>
        </div>
        <aside className="project-preview" aria-label="답변 화면 예시">
          <div className="project-preview-heading"><span>가상 문서 예시</span><BookOpen size={15} /></div>
          <div className="project-preview-question"><Search size={15} /><span>출장 정산은 언제까지야?</span></div>
          <div className="project-preview-answer">
            <strong>문서에서 확인한 내용</strong>
            <p>출장 비용은 복귀 후 7일 이내 정산합니다.</p>
          </div>
          <div className="project-preview-source"><FileText size={14} /><span>EXP-01.txt</span><small>정산 기한과 증빙 · 구간 2</small><ArrowUpRight size={13} /></div>
          <button className="project-preview-action" type="button" onClick={canTryExample ? onTryExample : onOpenDocuments}>{canTryExample ? exampleActionLabel : '내 문서 둘러보기'} <ArrowUpRight size={14}/></button>
        </aside>
      </div>

      <nav className="project-toc" aria-label="프로젝트 소개 바로가기">
        <a href="#project-process">처리 흐름</a>
        <a href="#project-evaluation">회귀 평가</a>
        <a href="#project-principles">설계 원칙</a>
        <a href="#project-workflow">사용 흐름</a>
        <a href="#project-next-checks">다음 검증</a>
      </nav>

      <section className="project-block">
        <div className="project-block-heading">
          <div>
            <span className="section-overline">처리 흐름</span>
            <h2 id="project-process" tabIndex={-1}>파일에서 근거 있는 답변까지</h2>
          </div>
          <span>개발 모드는 SQLite·로컬 Ollama를, 배포 모드는 PostgreSQL/pgvector와 설정된 Ollama를 사용합니다.</span>
        </div>
        <div className="architecture-flow">
          {architecture.map((step, index) => (
            <Fragment key={step.step}>
              <article className="architecture-card">
                <span className="architecture-step">{step.step}</span>
                <div className="architecture-icon">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
              {index < architecture.length - 1 && <span className="flow-arrow" aria-hidden="true">→</span>}
            </Fragment>
          ))}
        </div>
        <div className="stack-line">
          <Network size={15} />
          <span>React + Vite</span><i />
          <span>FastAPI</span><i />
          <span>배포: PostgreSQL + pgvector</span><i />
          <span>개발: SQLite</span><i />
          <span>Ollama</span>
        </div>
      </section>

      <section className="project-block evaluation-block">
        <div className="project-block-heading">
          <div>
            <span className="section-overline">개발용 회귀 평가</span>
          <h2 id="project-evaluation" tabIndex={-1}>기준 세트와 새 문서를 나눠 확인했습니다</h2>
          </div>
        <span>2026. 11. 8. · 로컬 Ollama · SQLite</span>
        </div>
        <div className="evaluation-context">
          <ListChecks size={16} />
          <p>재구성 골드 세트는 모노랩 가상 문서 3개와 36문항(답변 가능 24, 보류 12)입니다. 정답성은 출처 발췌를 제외한 본문으로 채점했습니다. 개발 중 보강에 사용한 회귀 결과라 블라인드 점수는 아닙니다.</p>
        </div>
        <div className="metric-grid">
          {metrics.map(metric => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.result}</strong>
              <small>{metric.detail}</small>
              <div className="metric-track" aria-hidden="true">
                <i style={{ width: `${metric.progress}%` }} />
              </div>
            </article>
          ))}
        </div>
        <div className="evaluation-comparison">
          <span>검색 방식별 Recall@5</span>
          <p>검색·답변·출처 24/24 <i /> 답을 찾지 못한 질문 보류 12/12 <i /> 중앙값 1.44초</p>
        </div>
        <div className="evaluation-context">
          <ListChecks size={16} />
          <p>
            운영 문서 2개의 회귀 질문 12개에서 검색·답변·인용 10/10, 답변 불가 보류 2/2였습니다. 허용·금지 조건 개발 질문 8개는 답변 6/6·보류 2/2였고, 한 문장에 상반된 규칙이 든 새 문서 6문항은 답변 5/5·보류 1/1이었습니다. 모두 자체 작성 합성 자료이며 실제 조직 자료의 성능을 보장하지 않습니다.
            {' '}<a className="evaluation-report-link" href="/evaluation/independent_v8_20261108_213814.json" download="munsodam-permission-development-evaluation.json">허용 조건 개발 평가 JSON</a>
          </p>
        </div>
        <details className="evaluation-method-details">
          <summary><BookOpen size={15} aria-hidden="true"/><span>측정 방식과 한계</span><ChevronDown size={14} aria-hidden="true"/></summary>
          <div className="evaluation-note">
            <div>
              <p>
                골드 문항은 기획서 규칙으로 재구성했으며, 기존 36문항은 답변 가능 24/24·출처 24/24·보류 12/12였습니다. 복합 답변과 미기재 정책 처리 개선에 사용했으므로 블라인드 점수가 아닙니다. 새 운영 문서 12문항도 변경 후 회귀했습니다.
              </p>
              <p>
                결과는 자체 작성한 합성 자료입니다. 응답 시간은 이 PC의 한 번 실행 결과이며 운영 부하 성능은 아닙니다. 핵심 문구 자동 채점은 동의어를 놓칠 수 있습니다. 답변 불가 정책 질문 2개는 추측하지 않고 보류했습니다.
              </p>
              <span>
                <a className="evaluation-report-link" href="/evaluation/gold_20261108_214008.json" download="munsodam-gold-evaluation.json">골드 회귀 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/dev_20261108_213902.json" download="munsodam-dev-evaluation.json">개발 회귀 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/independent_v6_20261108_193154.json" download="munsodam-independent-v6-evaluation.json">개발 도전 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/independent_v7_20261108_213756.json" download="munsodam-independent-v7-evaluation.json">새 문서 회귀 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/independent_v8_20261108_213814.json" download="munsodam-independent-v8-evaluation.json">허용 조건 개발 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/contrastive_v9_20261108_213831.json" download="munsodam-contrastive-v9-evaluation.json">상반 규칙 점검 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/negation_v10_20261108_214317.json" download="munsodam-negation-v10-evaluation.json">이중 부정·이메일 점검 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/long_document_v11_20261108_214726.json" download="munsodam-long-document-v11-evaluation.json">장문 경계 점검 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/docx_v12_20261108_215304.json" download="munsodam-docx-v12-evaluation.json">DOCX 계층 검색 JSON</a>
                {' · '}
                <a className="evaluation-report-link" href="/evaluation/injection_20261108_212551.json" download="munsodam-injection-evaluation.json">문서 지시문 점검 JSON</a>
                {' · '}2026. 11. 8.
              </span>
            </div>
          </div>
        </details>
      </section>

      <section className="project-block decisions-block">
        <div className="project-block-heading">
          <div>
            <span className="section-overline">설계 원칙</span>
            <h2 id="project-principles" tabIndex={-1}>답보다 먼저 근거를 확인합니다</h2>
          </div>
        </div>
        <div className="decision-grid">
          {principles.map(principle => (
            <article key={principle.title}>
              {principle.icon}
              <h3>{principle.title}</h3>
              <p>{principle.description}</p>
            </article>
          ))}
        </div>
        <div className="repro-command">
          <span>같은 골드 세트 다시 실행</span>
          <code>{evaluationCommand}</code>
          <button type="button" onClick={() => void copyEvaluationCommand()} aria-label="평가 명령어 복사">
            {commandCopyStatus === 'copied' ? <Check size={13} /> : <Copy size={13} />}
            {commandCopyStatus === 'copied' ? '복사됨' : '명령어 복사'}
          </button>
          {commandCopyStatus && <span className={`repro-command-status ${commandCopyStatus}`} role="status" aria-live="polite" aria-atomic="true">
            {commandCopyStatus === 'copied' ? '복사했습니다.' : '복사할 수 없어요. 명령어를 직접 선택해 복사해 주세요.'}
          </span>}
        </div>
      </section>

      <section className="project-block workflow-block">
        <div className="project-block-heading">
          <div>
            <span className="section-overline">사용 흐름</span>
            <h2 id="project-workflow" tabIndex={-1}>찾은 다음에 확인하고 정리할 수 있게</h2>
          </div>
          <span>검색 화면뿐 아니라 문서를 읽고 관리하는 단계까지 연결했습니다.</span>
        </div>
        <div className="workflow-grid">
          {workflows.map(item => (
            <article key={item.title}>
              <span className="workflow-icon">{item.icon}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="workflow-footnote">
          문서함은 계정 소유자 기준으로 분리됩니다. 삭제 전에는 대상 파일과 범위를 확인하며, 파일은 사용자가 직접 추가한 뒤에만 검색 대상에 들어갑니다.
        </p>
      </section>

      <section className="project-block next-checks-block">
        <div className="project-block-heading">
          <div>
            <span className="section-overline">범위와 다음 검증</span>
            <h2 id="project-next-checks" tabIndex={-1}>다음 단계도 분명하게</h2>
          </div>
          <span>현재 구현의 한계와 확장 전에 확인할 일을 함께 적었습니다.</span>
        </div>
        <div className="decision-grid">
          {nextChecks.map(item => (
            <article key={item.title}>
              {item.icon}
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
