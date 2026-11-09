import { ArrowUpRight, ChevronDown, FileText, Search } from 'lucide-react'
import { getDocumentChunkSummary, getDocumentLifecycle } from '../documentStatus'
import type { Doc, DocOutline } from '../types'
import { summarizeWorkspaceTopics } from '../workspaceDocumentTopicSummary.mjs'
import { documentUrl, isPlainLeftClick } from '../documentLinks.mjs'

function topicQuestion(title: string) {
  return `“${title}”의 핵심 내용과 근거를 알려줘.`
}

function unavailableDocumentMessage(lifecycle: ReturnType<typeof getDocumentLifecycle>) {
  if (lifecycle === 'processing') return '문서 처리가 끝나면 여기서 주제별 질문을 시작할 수 있어요.'
  if (lifecycle === 'extract_failed') return '파일을 읽지 못했어요. 문서를 열어 원본을 다시 읽어 주세요.'
  if (lifecycle === 'index_failed') return '검색 준비에 실패했어요. 문서를 열어 다시 처리해 주세요.'
  return ''
}

type WorkspaceDocumentContextProps = {
  documents: Doc[]
  outlines: Record<string, DocOutline>
  busy: boolean
  onOpenDocument: (document: Doc) => void
  onAskAboutDocument: (document: Doc, initialQuery?: string) => void
  onRetryOutline: (documentId: string) => void
  overline?: string
  title?: string
  description?: string
  className?: string
  selectedDocumentId?: string | null
}

export function SelectedDocumentContext({ document, documentName, outline, busy, fallbackQuestions, onOpen, onChooseQuestion, onRetryOutline }: {
  document: Doc
  documentName: string
  outline?: DocOutline
  busy: boolean
  fallbackQuestions: { label: string; question: string }[]
  onOpen: (document: Doc) => void
  onChooseQuestion: (question: string) => void
  onRetryOutline: (documentId: string) => void
}) {
  const questions = outline?.sections.length
    ? outline.sections.slice(0, 3).map(section => ({ label: section.title, question: topicQuestion(section.title) }))
    : fallbackQuestions

  return <section className="workspace-selected-document" aria-labelledby="workspace-selected-document-title">
    <div className="workspace-selected-heading">
      <span className={`workspace-topic-file file-${document.file_type}`}><FileText size={15} aria-hidden="true" /></span>
      <div>
        <span className="section-overline">선택한 문서 · 검색 구간 {document.chunk_count}개</span>
        <h2 id="workspace-selected-document-title">{documentName}</h2>
      </div>
      <a id={`workspace-scope-document-${document.id}`} href={documentUrl(document.id)} onClick={event => {
        if (isPlainLeftClick(event)) {
          event.preventDefault()
          event.currentTarget.focus({ preventScroll: true })
          onOpen(document)
        }
      }}>원문 보기 <ArrowUpRight size={13} aria-hidden="true" /></a>
    </div>
    <div className={`workspace-selected-content${outline?.preview ? ' has-preview' : ''}`}>
      {outline?.preview && <blockquote>{outline.preview}</blockquote>}
      <div className="workspace-selected-questions">
        <strong>{outline?.sections.length ? '주제로 질문 시작' : '질문 예시'}</strong>
        <div className="workspace-topic-sections">
          {questions.map(({ label, question }) => <button type="button" key={question} disabled={busy} onClick={() => onChooseQuestion(question)}>
            {label}<Search size={12} aria-hidden="true" />
          </button>)}
        </div>
        {outline?.unavailable && <div className="workspace-topic-outline-error">
          <span role="status">문서 주제를 불러오지 못했어요.</span>
          <button type="button" onClick={() => onRetryOutline(document.id)}>다시 불러오기</button>
        </div>}
      </div>
    </div>
  </section>
}

export default function WorkspaceDocumentContext({
  documents,
  outlines,
  busy,
  onOpenDocument,
  onAskAboutDocument,
  onRetryOutline,
  overline = '자료 둘러보기',
  title = '문서에서 다루는 내용',
  description = '주제를 누르면 문서 범위를 고르고 질문 문장을 채웁니다.',
  className = '',
  selectedDocumentId = null,
}: WorkspaceDocumentContextProps) {
  if (documents.length === 0) return null

  return (
    <section className={`workspace-document-context ${className}`.trim()} aria-labelledby="workspace-document-context-title">
      <div className="workspace-document-context-heading">
        <div>
          <span className="section-overline">{overline}</span>
          <h2 id="workspace-document-context-title">{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="workspace-document-context-grid" data-count={Math.min(documents.length, 3)}>
        {documents.map(document => {
          const outline = outlines[document.id]
          const lifecycle = getDocumentLifecycle(document.status, document.index_status)
          const searchable = lifecycle === 'searchable'
          const unavailableMessage = unavailableDocumentMessage(lifecycle)
          const documentSummary = searchable
            ? `검색 가능 · 검색 구간 ${document.chunk_count}개`
            : getDocumentChunkSummary(document)
          return (
            <article className="workspace-topic-card" key={document.id}>
              <div className="workspace-topic-heading">
                <span className={`workspace-topic-file file-${document.file_type}`}><FileText size={15} aria-hidden="true" /></span>
                <div>
                  <a id={`workspace-topic-doc-${document.id}`} className="workspace-topic-title" href={documentUrl(document.id)} onClick={event => {
                    if (isPlainLeftClick(event)) {
                      event.preventDefault()
                      event.currentTarget.focus({ preventScroll: true })
                      onOpenDocument(document)
                    }
                  }} title={document.filename}>{document.filename}</a>
                  <small>{documentSummary}{document.id === selectedDocumentId ? ' · 선택 범위' : ''}</small>
                </div>
              </div>
              {outline?.preview && <p className="workspace-topic-preview" title={outline.preview}>{outline.preview}</p>}
              {!searchable ? (
                <p className={`workspace-topic-unavailable status-${lifecycle}`} role="status">{unavailableMessage}</p>
              ) : outline?.unavailable ? (
                <div className="workspace-topic-outline-error">
                  <span role="alert" aria-live="assertive">주제를 불러오지 못했어요.</span>
                  <button type="button" onClick={() => onRetryOutline(document.id)}>다시 불러오기</button>
                </div>
              ) : outline?.sections.length ? (
                <div className="workspace-topic-sections" aria-label={`${document.filename}의 구간 제목`}>
                  {outline.sections.map(section => (
                    <button
                      type="button"
                      key={`${section.first_chunk_index}-${section.title}`}
                      disabled={!searchable || busy}
                      onClick={() => onAskAboutDocument(document, topicQuestion(section.title))}
                      title={`${document.filename}에서 “${section.title}”의 핵심 내용과 근거를 묻기`}
                    >{section.title}<Search size={11} aria-hidden="true" /></button>
                  ))}
                  {outline.more_sections > 0 && <a
                    className="workspace-topic-more"
                    href={documentUrl(document.id)}
                    onClick={event => {
                      if (isPlainLeftClick(event)) {
                        event.preventDefault()
                        onOpenDocument(document)
                      }
                    }}
                    title={`${document.filename} 열기 · 추가 주제 ${outline.more_sections}개`}
                  >+{outline.more_sections} · 문서 열기 <ArrowUpRight size={11} aria-hidden="true" /></a>}
                </div>
              ) : outline ? (
                <p className="workspace-topic-empty">주제 구분 없이 문서 전체에서 질문할 수 있어요.</p>
              ) : (
                <p className="workspace-topic-loading" role="status">구간 제목을 불러오는 중…</p>
              )}
              {searchable && <button className="workspace-topic-ask" type="button" disabled={busy} onClick={() => onAskAboutDocument(document)}>
                이 문서에서 질문 <ArrowUpRight size={13} aria-hidden="true" />
              </button>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function WorkspaceDocumentTopics({
  documents,
  outlines,
  busy,
  onRetryOutline,
  onOpenDocument,
  onAskAboutDocument,
  selectedDocumentId = null,
  className = '',
  open,
  onOpenChange,
  idPrefix = 'workspace',
}: Pick<WorkspaceDocumentContextProps, 'documents' | 'outlines' | 'busy' | 'onRetryOutline' | 'onOpenDocument' | 'onAskAboutDocument' | 'selectedDocumentId'> & { className?: string; open?: boolean; onOpenChange?: (open: boolean) => void; idPrefix?: string }) {
  const documentsWithTopics = documents.map(document => ({ document, outline: outlines[document.id] }))

  const topicCount = documentsWithTopics.reduce((count, item) => count
    + (item.outline?.sections.length ?? 0)
    + Math.max(0, item.outline?.more_sections ?? 0), 0)
  const loadingCount = documentsWithTopics.filter(item => !item.outline).length
  const unavailableCount = documentsWithTopics.filter(item => item.outline?.unavailable).length
  const searchableCount = documents.filter(document => getDocumentLifecycle(document.status, document.index_status) === 'searchable').length
  const topicSummary = summarizeWorkspaceTopics({
    documentCount: documents.length,
    topicCount,
    loadingCount,
    unavailableCount,
    searchableCount,
  })

  if (documentsWithTopics.length === 0) return null

  return (
    <section className={`workspace-mobile-topics ${className}`.trim()} aria-label="문서 구간에서 질문 시작">
      <details
        className="workspace-mobile-topics-details"
        data-detail-return-disclosure={onOpenChange ? 'mobile-document-topics' : undefined}
        open={open}
        onToggle={event => onOpenChange?.(event.currentTarget.open)}
      >
        <summary className="workspace-mobile-topics-heading">
          <span><strong>문서 구간으로 질문 만들기</strong><small>{topicSummary} · 최근 문서와 즐겨찾기</small></span>
          <ChevronDown className="workspace-mobile-topics-chevron" size={15} aria-hidden="true" />
        </summary>
        <div className="workspace-mobile-topic-groups">
        {documentsWithTopics.map(({ document, outline }) => {
          const lifecycle = getDocumentLifecycle(document.status, document.index_status)
          const searchable = lifecycle === 'searchable'
          const unavailableMessage = unavailableDocumentMessage(lifecycle)
          const sections = outline?.sections.slice(0, 3) ?? []
          const remainingTopics = outline
            ? Math.max(0, outline.sections.length - sections.length) + Math.max(0, outline.more_sections)
            : 0
          return (
            <div className="workspace-mobile-topic-group" key={document.id}>
              <a
                className="workspace-mobile-topic-document"
                id={`workspace-mobile-topic-doc-${idPrefix}-${document.id}`}
                href={documentUrl(document.id)}
                title={`${document.filename} 원문 열기`}
                onClick={event => {
                  if (isPlainLeftClick(event)) {
                    event.preventDefault()
                    onOpenDocument(document)
                  }
                }}
              ><span>{document.filename}</span>{document.id === selectedDocumentId && <small>선택 범위</small>}<ArrowUpRight size={12} aria-hidden="true" /></a>
              {!searchable ? (
                <div className={`workspace-mobile-topic-state${lifecycle === 'extract_failed' || lifecycle === 'index_failed' ? ' error' : ''}`} role="status">{unavailableMessage}</div>
              ) : outline?.unavailable ? (
                <div className="workspace-mobile-topic-state error">
                  <span role="alert" aria-live="assertive">주제를 불러오지 못했어요.</span>
                  <button type="button" onClick={() => onRetryOutline(document.id)}>다시 불러오기</button>
                </div>
              ) : !outline ? (
                <div className="workspace-mobile-topic-state" role="status">문서 제목을 불러오는 중…</div>
              ) : sections.length === 0 ? (
                <div className="workspace-mobile-topic-empty">
                  <span>제목 구분 없이 문서 전체에서 질문할 수 있어요.</span>
                  {outline.preview && <small title={outline.preview}>{outline.preview}</small>}
                </div>
              ) : (
                <div className="workspace-mobile-topic-list">
                  {sections.map(section => (
                    <button
                      type="button"
                      key={`${section.first_chunk_index}-${section.title}`}
                      disabled={!searchable || busy}
                      onClick={() => onAskAboutDocument(document, topicQuestion(section.title))}
                      title={`${document.filename} 범위를 선택하고 “${section.title}”의 핵심과 근거를 묻기`}
                    >{section.title}<Search size={11} aria-hidden="true" /></button>
                  ))}
                  {remainingTopics > 0 && <a
                    className="workspace-mobile-topic-more"
                    href={documentUrl(document.id)}
                    onClick={event => {
                      if (isPlainLeftClick(event)) {
                        event.preventDefault()
                        onOpenDocument(document)
                      }
                    }}
                    title={`${document.filename} 열기 · 추가 주제 ${remainingTopics}개`}
                  >+{remainingTopics} · 문서에서 보기 <ArrowUpRight size={11} aria-hidden="true" /></a>}
                </div>
              )}
            </div>
          )
        })}
        </div>
      </details>
    </section>
  )
}
