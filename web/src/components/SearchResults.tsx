import { ArrowDown, ArrowDownToLine, ArrowUpRight, BookOpen, Bookmark, Copy, FileText, LoaderCircle, Pencil, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cleanAnswerText } from '../cleanAnswerText'
import { documentUrl, isPlainLeftClick } from '../documentLinks.mjs'
import { downloadMarkdown, localDateStamp, markdownQuote, markdownText } from '../markdownExport.mjs'
import { preferredScrollBehavior } from '../scrollBehavior'
import EvidenceContext from './EvidenceContext'
import HighlightedExcerpt from './HighlightedExcerpt'
import type { ChatResult, SearchResult } from '../types'

type RecentSearch = { query: string; mode: 'vector' | 'keyword' | 'hybrid'; view: 'results' | 'answer'; documentId: string | null; scopeLabel?: string }

type SearchResultsProps = {
  recentSearches: RecentSearch[]
  query: string
  mode: 'vector' | 'keyword' | 'hybrid'
  scopeLabel: string
  onEditQuery: () => void
  searchMessage: string
  requestFailed: boolean
  results: SearchResult[]
  chatResult: ChatResult | null
  answerStyle: 'concise' | 'detailed'
  onAnswerStyleChange: (style: 'concise' | 'detailed') => void
  chatError: string
  copyMessage: string
  sourceCopyMessage: { id: string; message: string } | null
  documentNameFor: (documentId: string, filename: string) => string
  sourceAvailabilityFor: (documentId: string) => boolean | null
  busy: boolean
  answerPending: boolean
  canRepeatSearch: (search: RecentSearch) => boolean
  isDocumentScoped: boolean
  hasOtherSearchableDocuments: boolean
  onSourceOpen: (source: SearchResult) => void
  onCopySource: (source: SearchResult) => void
  isEvidenceSaved: (chunkId: string) => boolean
  onToggleSavedEvidence: (source: SearchResult, query: string) => void
  onSearchAll: (query: string) => void
  onBrowseDocuments: () => void
  onRepeatSearch: (search: SearchResultsProps['recentSearches'][number]) => void
  onViewSearchHistory: () => void
  onClearRecentSearches: () => void
  onTryOtherSearchMode: () => void
  canTryOtherSearchMode: boolean
  alternativeSearchLabel: string
  onCopy: () => void
  onRetry: () => void
}

function sourceLocation(source: SearchResult) {
  return source.page_number
    ? `p. ${source.page_number}`
    : source.section_path || '문서 구간'
}

function sourceHref(source: SearchResult) {
  return documentUrl(source.document_id, source.chunk_index)
}

function SaveEvidenceButton({ source, query, documentName, isSaved, onToggle }: {
  source: SearchResult
  query: string
  documentName: string
  isSaved: boolean
  onToggle: (source: SearchResult, query: string) => void
}) {
  return <button type="button" className={`save-source ${isSaved ? 'active' : ''}`} aria-pressed={isSaved}
    aria-label={isSaved ? `${documentName} 근거 저장 해제` : `${documentName} 근거 저장`}
    title={isSaved ? '저장한 근거에서 제거' : '나중에 볼 근거로 저장'} onClick={() => onToggle(source, query)}>
    <Bookmark size={13} fill={isSaved ? 'currentColor' : 'none'} />{isSaved ? '저장됨' : '저장'}
  </button>
}

function ExpandableExcerpt({ id, text, query }: { id: string; text: string; query: string }) {
  const excerptRef = useRef<HTMLQuoteElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [expandable, setExpandable] = useState(false)

  useEffect(() => {
    const excerpt = excerptRef.current
    if (!excerpt || expanded) return

    const updateOverflow = () => setExpandable(excerpt.scrollHeight > excerpt.clientHeight + 1)
    updateOverflow()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateOverflow)
      observer.observe(excerpt)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateOverflow)
    return () => window.removeEventListener('resize', updateOverflow)
  }, [expanded, query, text])

  return <>
    <blockquote ref={excerptRef} id={id} className={`evidence-excerpt${expanded ? '' : ' collapsed'}`}>
      <HighlightedExcerpt text={text} query={query} />
    </blockquote>
    {expandable && <button type="button" className="evidence-excerpt-toggle" aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {expanded ? '발췌 접기' : '발췌 전체 보기'}
    </button>}
  </>
}

function downloadAnswerMarkdown(answer: ChatResult, query: string, cleanAnswer: string, mode: SearchResultsProps['mode'], scopeLabel: string, documentNameFor: SearchResultsProps['documentNameFor'], sourceAvailabilityFor: SearchResultsProps['sourceAvailabilityFor']) {
  const sourceSections = answer.sources.flatMap((source, index) => {
    const location = source.page_number
      ? `p. ${source.page_number}`
      : source.section_path || `구간 ${source.chunk_index + 1}`
    const excerpt = markdownQuote(source.excerpt)
    const filename = markdownText(documentNameFor(source.document_id, source.filename))
    const documentUrl = `${window.location.origin}${sourceHref(source)}`
    const originalSource = sourceAvailabilityFor(source.document_id) === false
      ? '- 원문: 문서가 삭제되어 열 수 없습니다.'
      : `- 원문: [문서 열기](${documentUrl})`
    return [
      `### ${index + 1}. ${filename}`,
      `- 위치: ${markdownText(location)}`,
      originalSource,
      '',
      excerpt,
      '',
    ]
  })
  const markdown = [
    `# ${markdownText(query.trim().replace(/\s+/g, ' ') || '문서 검색 답변')}`,
    '',
    `- 검색 범위: ${markdownText(scopeLabel)}`,
    `- 검색 방식: ${mode === 'keyword' ? '정확한 단어' : mode === 'vector' ? '비슷한 내용' : '함께 찾기'}`,
    '',
    cleanAnswer,
    '',
    ...(sourceSections.length > 0 ? ['## 근거 문서', '', ...sourceSections] : []),
  ].join('\n')
  const safeQuery = query.normalize('NFKC').trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || '답변'
  const date = localDateStamp(new Date())
  downloadMarkdown(markdown, `문서담-${safeQuery}-${date}.md`)
}

function downloadSearchResultsMarkdown(
  results: SearchResult[],
  query: string,
  mode: SearchResultsProps['mode'],
  scopeLabel: string,
  documentNameFor: SearchResultsProps['documentNameFor'],
  sourceAvailabilityFor: SearchResultsProps['sourceAvailabilityFor'],
) {
  const modeLabel = mode === 'keyword' ? '정확한 단어' : mode === 'vector' ? '비슷한 내용' : '함께 찾기'
  const sources = results.map((source, index) => {
    const location = source.page_number
      ? `p. ${source.page_number}`
      : source.section_path || `구간 ${source.chunk_index + 1}`
    const name = markdownText(documentNameFor(source.document_id, source.filename))
    const sourceLink = sourceAvailabilityFor(source.document_id) === false
      ? '- 원문: 문서가 삭제되어 열 수 없습니다.'
      : `- 원문: [문서 열기](${window.location.origin}${sourceHref(source)})`
    const excerpt = markdownQuote(source.excerpt)
    return [`## ${index + 1}. ${name}`, `- 위치: ${markdownText(location)}`, `- 일치 유형: ${source.match_type === 'keyword' ? '단어 일치' : source.match_type === 'semantic' ? '내용 유사' : '문서 발췌'}`, sourceLink, '', excerpt]
  })
  const normalizedQuery = query.trim().replace(/\s+/g, ' ') || '문서 검색 결과'
  const markdown = [
    `# ${markdownText(normalizedQuery)}`,
    '',
    `- 검색 범위: ${markdownText(scopeLabel)}`,
    `- 검색 방식: ${modeLabel}`,
    `- 결과: ${results.length}개`,
    '',
    ...sources.flatMap(source => [...source, '']),
  ].join('\n')
  const safeQuery = normalizedQuery.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || '검색-결과'
  const date = localDateStamp(new Date())
  downloadMarkdown(markdown, `문서담-${safeQuery}-${date}.md`)
}

function RecentSearchRecovery({
  searches,
  busy,
  canRepeatSearch,
  onRepeat,
  onViewHistory,
  onClear,
}: {
  searches: RecentSearch[]
  busy: boolean
  canRepeatSearch: (search: RecentSearch) => boolean
  onRepeat: (search: RecentSearch) => void
  onViewHistory: () => void
  onClear: () => void
}) {
  if (searches.length === 0) return null
  return <section className="no-results-recent" aria-label="최근 검색 다시 시도">
    <div className="no-results-recent-heading"><strong>최근 검색에서 다시 찾아보기</strong><div className="no-results-recent-actions"><button type="button" className="no-results-history-open" aria-label="검색 기록 전체 보기" onClick={onViewHistory}>모두 보기 <ArrowUpRight size={12} aria-hidden="true" /></button><button type="button" aria-label="최근 검색 기록 모두 지우기" onClick={onClear}>기록 지우기</button></div></div>
    <div className="no-results-recent-list">{searches.slice(0, 3).map(item => {
      const scopeLabel = item.scopeLabel ?? (item.documentId ? '선택 문서' : '전체 문서')
      const needsScopeFallback = Boolean(item.documentId && canRepeatSearch(item) && (
        scopeLabel === '삭제된 문서'
        || scopeLabel.endsWith(' · 준비 중')
        || scopeLabel.endsWith(' · 읽기 실패')
        || scopeLabel.endsWith(' · 다시 처리 필요')
      ))
      return <button key={`${item.documentId ?? 'all'}:${item.mode}:${item.query}`} type="button" disabled={busy || !canRepeatSearch(item)} title={!canRepeatSearch(item) ? '문서 검색을 사용할 수 있을 때 다시 실행할 수 있어요.' : needsScopeFallback ? '전체 문서 범위에서 다시 찾습니다.' : item.query} onClick={() => onRepeat(item)}>
      <span>{item.query}</span><small>{item.view === 'answer' ? '답변' : item.mode === 'vector' ? '비슷한 내용' : item.mode === 'keyword' ? '정확한 단어' : '함께 찾기'} · {scopeLabel}{needsScopeFallback ? ' · 전체 문서로 다시 찾기' : ''}</small><ArrowUpRight size={13} aria-hidden="true"/>
    </button>
    })}</div>
  </section>
}

function EvidenceCard({
  source,
  rank,
  query,
  onSourceOpen,
  onCopySource,
  isEvidenceSaved,
  onToggleSavedEvidence,
  copyMessage,
  documentNameFor,
  sourceAvailabilityFor,
}: {
  source: SearchResult
  rank: number
  query: string
  onSourceOpen: SearchResultsProps['onSourceOpen']
  onCopySource: SearchResultsProps['onCopySource']
  isEvidenceSaved: SearchResultsProps['isEvidenceSaved']
  onToggleSavedEvidence: SearchResultsProps['onToggleSavedEvidence']
  copyMessage: string
  documentNameFor: SearchResultsProps['documentNameFor']
  sourceAvailabilityFor: SearchResultsProps['sourceAvailabilityFor']
}) {
  const copied = copyMessage === '출처와 발췌를 복사했습니다.'
  const documentName = documentNameFor(source.document_id, source.filename)
  const sourceUnavailable = sourceAvailabilityFor(source.document_id) === false
  return (
    <article className="evidence-card">
      <div className="evidence-top">
        <span className="rank">{rank}</span>
        <div className="evidence-source">
          {sourceUnavailable ? <strong className="source-unavailable-name">{documentName}</strong> : <a id={`evidence-source-${source.chunk_id}`} className="source-open" href={sourceHref(source)} title={documentName} aria-label={`${documentName} · ${sourceLocation(source)} · 구간 ${source.chunk_index + 1} 원문 열기`} onClick={event => {
            if (isPlainLeftClick(event)) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
              onSourceOpen(source)
            }
          }}>
            <span>{documentName}</span> <ArrowUpRight size={12} />
          </a>}
          <span title={`${sourceLocation(source)} · 구간 ${source.chunk_index + 1}`}>{sourceLocation(source)} · 구간 {source.chunk_index + 1}</span>
          {sourceUnavailable && <span className="evidence-source-missing" role="status" aria-live="polite" aria-atomic="true">원문 문서는 삭제됐어요 · 발췌는 계속 확인할 수 있어요</span>}
        </div>
        <div className="evidence-actions">
          <span className={`source-label match-${source.match_type ?? 'source'}`}>
            {source.match_type === 'keyword' ? '단어 일치' : source.match_type === 'semantic' ? '내용 유사' : '문서 발췌'}
          </span>
          <button className="copy-source" onClick={() => onCopySource(source)} aria-label={`${documentNameFor(source.document_id, source.filename)} 근거와 출처 복사`}>
            <Copy size={13} /> {copied ? '복사됨' : '복사'}
          </button>
          <SaveEvidenceButton source={source} query={query} documentName={documentNameFor(source.document_id, source.filename)} isSaved={isEvidenceSaved(source.chunk_id)} onToggle={onToggleSavedEvidence} />
        </div>
      </div>
      {copyMessage && <span className={copied ? 'sr-only' : 'source-copy-status error'} role="status" aria-live="polite">{copyMessage}</span>}
      <ExpandableExcerpt id={`search-excerpt-${source.chunk_id}`} text={source.excerpt} query={query} />
      {!sourceUnavailable && <EvidenceContext source={source} query={query} documentName={documentName} disclosureKey={`search-context-${source.chunk_id}`} />}
    </article>
  )
}

function AnswerCard({
  answer,
  recentSearches,
  busy,
  canRepeatSearch,
  isDocumentScoped,
  hasOtherSearchableDocuments,
  copyMessage,
  onSearchAll,
  onBrowseDocuments,
  onRepeatSearch,
  onViewSearchHistory,
  onClearRecentSearches,
  onCopy,
  onSourceOpen,
  onCopySource,
  isEvidenceSaved,
  onToggleSavedEvidence,
  sourceCopyMessage,
  query,
  documentNameFor,
  sourceAvailabilityFor,
  mode,
  scopeLabel,
  onDownloadStarted,
  answerStyle,
  onAnswerStyleChange,
}: {
  answer: ChatResult
  recentSearches: RecentSearch[]
  busy: boolean
  canRepeatSearch: SearchResultsProps['canRepeatSearch']
  isDocumentScoped: boolean
  hasOtherSearchableDocuments: boolean
  query: string
  mode: SearchResultsProps['mode']
  scopeLabel: string
  onDownloadStarted: () => void
  answerStyle: SearchResultsProps['answerStyle']
  onAnswerStyleChange: SearchResultsProps['onAnswerStyleChange']
  copyMessage: string
  onSearchAll: SearchResultsProps['onSearchAll']
  onBrowseDocuments: () => void
  onRepeatSearch: SearchResultsProps['onRepeatSearch']
  onViewSearchHistory: SearchResultsProps['onViewSearchHistory']
  onClearRecentSearches: () => void
  onCopy: () => void
  onSourceOpen: SearchResultsProps['onSourceOpen']
  onCopySource: SearchResultsProps['onCopySource']
  isEvidenceSaved: SearchResultsProps['isEvidenceSaved']
  onToggleSavedEvidence: SearchResultsProps['onToggleSavedEvidence']
  sourceCopyMessage: SearchResultsProps['sourceCopyMessage']
  documentNameFor: SearchResultsProps['documentNameFor']
  sourceAvailabilityFor: SearchResultsProps['sourceAvailabilityFor']
}) {
  const cleanAnswer = cleanAnswerText(answer.answer, query, answer.sources)
  const sourcesHeadingRef = useRef<HTMLHeadingElement>(null)
  const hasPolicyConflict = answer.abstained && answer.reason?.includes('규정 값이 문서마다 다릅니다')
  const displayedSources = hasPolicyConflict ? answer.conflicting_sources ?? [] : answer.sources
  const hasSources = displayedSources.length > 0

  function showSources() {
    const heading = sourcesHeadingRef.current
    if (!heading) return
    heading.focus({ preventScroll: true })
    heading.scrollIntoView({ block: 'start', behavior: preferredScrollBehavior() })
  }

  return (
    <article className={`chat-result${answer.abstained ? ' abstained' : ''}${hasSources ? ' has-sources' : ''}`}>
      <div className="answer-body">
        <div className="answer-header">
          <div className="answer-title" role="status">
            <span className="answer-symbol"><BookOpen size={16} /></span>
            <div>
              <strong>{hasPolicyConflict ? '문서마다 규정이 달라요' : answer.abstained ? '문서에서 답을 찾지 못했어요' : '문서 내용을 바탕으로 답변했어요'}</strong>
              {answer.abstained && <span>{answer.reason?.trim() || '문서 내용을 더 확인하거나 질문 표현을 바꿔 보세요.'}</span>}
            </div>
          </div>
          {hasSources && <button type="button" className="answer-sources-jump" onClick={showSources}>
            {hasPolicyConflict ? '충돌 문서' : '근거'} {displayedSources.length}개 보기 <ArrowDown size={13} aria-hidden="true" />
          </button>}
        </div>
        <p>{hasPolicyConflict ? '서로 다른 규정이 검색되어 한 가지 답으로 단정할 수 없어요.' : cleanAnswer}</p>
        {answer.abstained ? (
          <>
            <div className="abstain-hint">
              <span>{hasPolicyConflict ? '질문에 적용 연도를 넣거나 검색 범위를 문서 하나로 좁혀 다시 물어보세요.' : '관련 자료가 아직 없다면 문서함에서 먼저 추가할 수 있습니다.'}</span>
              {isDocumentScoped && hasOtherSearchableDocuments && <button type="button" disabled={busy} onClick={() => onSearchAll(query)}><Search size={12} /> 전체 문서에서 찾기</button>}
              <button onClick={onBrowseDocuments}>문서함 열기 <ArrowUpRight size={12} /></button>
            </div>
            <RecentSearchRecovery searches={recentSearches} busy={busy} canRepeatSearch={canRepeatSearch} onRepeat={onRepeatSearch} onViewHistory={onViewSearchHistory} onClear={onClearRecentSearches} />
          </>
        ) : (
          <div className="answer-toolbar">
            <div className="answer-style-control" role="group" aria-label="답변 길이">
              <span>답변 길이</span>
              <button type="button" aria-pressed={answerStyle === 'concise'} disabled={busy} onClick={() => onAnswerStyleChange('concise')}>간단히</button>
              <button type="button" aria-pressed={answerStyle === 'detailed'} disabled={busy} onClick={() => onAnswerStyleChange('detailed')}>자세히</button>
            </div>
            <span className="answer-copy-status" aria-live="polite">{copyMessage}</span>
            <div className="answer-toolbar-actions">
              <button type="button" onClick={() => {
                downloadAnswerMarkdown(answer, query, cleanAnswer, mode, scopeLabel, documentNameFor, sourceAvailabilityFor)
                onDownloadStarted()
              }}><ArrowDownToLine size={13} /> Markdown 저장</button>
              <button type="button" onClick={onCopy}><Copy size={13} /> 답변과 출처 복사</button>
            </div>
          </div>
        )}
      </div>
      {hasSources && (
        <section className="chat-sources" aria-labelledby="answer-sources-heading">
          <h3 id="answer-sources-heading" ref={sourcesHeadingRef} tabIndex={-1}>{hasPolicyConflict ? '서로 다른 규정의 원문' : '답변 근거'}</h3>
          {displayedSources.map(source => {
            const documentName = documentNameFor(source.document_id, source.filename)
            const sourceUnavailable = sourceAvailabilityFor(source.document_id) === false
            return (
            <div className="chat-source" key={source.chunk_id}>
              <div className="source-meta">
                <FileText size={14} />
                <div className="source-meta-file">
                  {sourceUnavailable ? <strong className="source-unavailable-name">{documentName}</strong> : <a id={`answer-source-${source.chunk_id}`} className="source-open" href={sourceHref(source)} title={documentName} aria-label={`${documentName} · ${sourceLocation(source)} · 구간 ${source.chunk_index + 1} 원문 열기`} onClick={event => {
                    if (isPlainLeftClick(event)) {
                      event.preventDefault()
                      event.currentTarget.focus({ preventScroll: true })
                      onSourceOpen(source)
                    }
                  }}>
                    <span>{documentName}</span> <ArrowUpRight size={12} />
                  </a>}
                  <span className="source-location" title={`${sourceLocation(source)} · 구간 ${source.chunk_index + 1}`}>{sourceLocation(source)} · 구간 {source.chunk_index + 1}</span>
                  {sourceUnavailable && <span className="source-unavailable-note" role="status" aria-live="polite" aria-atomic="true">원문 문서는 삭제됐어요 · 발췌는 계속 확인할 수 있어요</span>}
                </div>
                <div className="source-meta-actions">
                  <button className="copy-source" onClick={() => onCopySource(source)} aria-label={`${documentNameFor(source.document_id, source.filename)} 근거와 출처 복사`}>
                    <Copy size={13} /> {sourceCopyMessage?.id === source.chunk_id && sourceCopyMessage.message === '출처와 발췌를 복사했습니다.' ? '복사됨' : '복사'}
                  </button>
                  <SaveEvidenceButton source={source} query={query} documentName={documentNameFor(source.document_id, source.filename)} isSaved={isEvidenceSaved(source.chunk_id)} onToggle={onToggleSavedEvidence} />
                </div>
              </div>
              {sourceCopyMessage?.id === source.chunk_id && <span className={sourceCopyMessage.message === '출처와 발췌를 복사했습니다.' ? 'sr-only' : 'source-copy-status error'} role="status" aria-live="polite">{sourceCopyMessage.message}</span>}
              <ExpandableExcerpt id={`answer-excerpt-${source.chunk_id}`} text={source.excerpt} query={query} />
              {!sourceUnavailable && <EvidenceContext source={source} query={query} documentName={documentName} disclosureKey={`answer-context-${source.chunk_id}`} />}
            </div>
            )
          })}
        </section>
      )}
    </article>
  )
}

export default function SearchResults({
  recentSearches,
  query,
  mode,
  scopeLabel,
  onEditQuery,
  searchMessage,
  requestFailed,
  results,
  chatResult,
  answerStyle,
  onAnswerStyleChange,
  chatError,
  copyMessage,
  sourceCopyMessage,
  documentNameFor,
  sourceAvailabilityFor,
  busy,
  answerPending,
  canRepeatSearch,
  isDocumentScoped,
  hasOtherSearchableDocuments,
  onSourceOpen,
  onCopySource,
  isEvidenceSaved,
  onToggleSavedEvidence,
  onSearchAll,
  onBrowseDocuments,
  onRepeatSearch,
  onViewSearchHistory,
  onClearRecentSearches,
  onTryOtherSearchMode,
  canTryOtherSearchMode,
  alternativeSearchLabel,
  onCopy,
  onRetry,
}: SearchResultsProps) {
  const [downloadAnnouncement, setDownloadAnnouncement] = useState('')
  const downloadAnnouncementTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (downloadAnnouncementTimerRef.current !== null) window.clearTimeout(downloadAnnouncementTimerRef.current)
  }, [])

  function announceDownloadStarted(kind: '검색 근거' | '답변') {
    if (downloadAnnouncementTimerRef.current !== null) window.clearTimeout(downloadAnnouncementTimerRef.current)
    setDownloadAnnouncement('')
    window.requestAnimationFrame(() => {
      setDownloadAnnouncement(`${kind} Markdown 다운로드를 시작했습니다.`)
      downloadAnnouncementTimerRef.current = window.setTimeout(() => setDownloadAnnouncement(''), 4000)
    })
  }

  if (!searchMessage && !chatError && !chatResult && results.length === 0 && !answerPending) return null

  const rankedResults = results.map((source, index) => ({ source, rank: index + 1 }))
  const keywordResults = rankedResults.filter(({ source }) => source.match_type === 'keyword')
  const similarResults = rankedResults.filter(({ source }) => source.match_type !== 'keyword')
  const groupSimilarResults = mode === 'hybrid' && keywordResults.length > 0 && similarResults.length > 0

  const evidenceCard = ({ source, rank }: typeof rankedResults[number]) => (
    <EvidenceCard
      key={source.chunk_id}
      source={source}
      rank={rank}
      query={query}
      onSourceOpen={onSourceOpen}
      onCopySource={onCopySource}
      isEvidenceSaved={isEvidenceSaved}
      onToggleSavedEvidence={onToggleSavedEvidence}
      documentNameFor={documentNameFor}
      sourceAvailabilityFor={sourceAvailabilityFor}
      copyMessage={sourceCopyMessage?.id === source.chunk_id ? sourceCopyMessage.message : ''}
    />
  )

  return (
    <section className="results-section" aria-busy={busy}>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{downloadAnnouncement}</span>
      <div className="results-heading">
        <div className="results-query">
          <div>
          <span className="section-overline">{chatResult || answerPending ? '답변' : '검색 결과'}</span>
          <h2 title={query}>{query}</h2>
          </div>
          <button type="button" disabled={busy} onClick={onEditQuery}><Pencil size={13} aria-hidden="true"/> 질문 수정</button>
        </div>
        <div className="results-heading-meta">
          <span className="result-scope-label"><FileText size={13} />{scopeLabel}</span>
          {searchMessage && searchMessage !== '관련 내용을 찾지 못했어요.' && !requestFailed && <span className="result-count" role="status" aria-live="polite">{searchMessage}</span>}
          {!chatResult && results.length > 0 && !requestFailed && <button
            type="button"
            className="search-results-export"
            title={`현재 표시된 검색 근거 ${results.length}개를 문서 위치와 원문 링크를 포함해 Markdown 파일로 내려받습니다.`}
            onClick={() => {
              downloadSearchResultsMarkdown(results, query, mode, scopeLabel, documentNameFor, sourceAvailabilityFor)
              announceDownloadStarted('검색 근거')
            }}
          ><ArrowDownToLine size={13} aria-hidden="true"/> 근거 내보내기</button>}
        </div>
      </div>

      {chatError && !requestFailed && <div className="chat-error" role="alert">{chatError}</div>}
      {requestFailed && <div className="request-retry"><span role="alert" aria-live="assertive">{chatError || searchMessage}</span><button type="button" disabled={busy} onClick={onRetry}>{busy ? <><LoaderCircle size={13} className="spin"/> 다시 확인 중…</> : <>다시 시도 <ArrowUpRight size={13}/></>}</button></div>}
      {answerPending && !chatResult && !requestFailed && <div className="answer-pending" role="status" aria-live="polite">
        <LoaderCircle size={17} aria-hidden="true" />
        <span><strong>문서에서 근거를 확인하고 있어요.</strong><small>답변과 출처를 준비하고 있습니다.</small></span>
      </div>}
      {chatResult && (
        <AnswerCard
          answer={chatResult}
          answerStyle={answerStyle}
          onAnswerStyleChange={onAnswerStyleChange}
          recentSearches={recentSearches}
          busy={busy}
          canRepeatSearch={canRepeatSearch}
          isDocumentScoped={isDocumentScoped}
          hasOtherSearchableDocuments={hasOtherSearchableDocuments}
          query={query}
          mode={mode}
          scopeLabel={scopeLabel}
          onDownloadStarted={() => announceDownloadStarted('답변')}
          documentNameFor={documentNameFor}
          sourceAvailabilityFor={sourceAvailabilityFor}
          copyMessage={copyMessage}
          onSearchAll={onSearchAll}
          onBrowseDocuments={onBrowseDocuments}
          onRepeatSearch={onRepeatSearch}
          onViewSearchHistory={onViewSearchHistory}
          onClearRecentSearches={onClearRecentSearches}
          onCopy={onCopy}
          onSourceOpen={onSourceOpen}
          onCopySource={onCopySource}
          isEvidenceSaved={isEvidenceSaved}
          onToggleSavedEvidence={onToggleSavedEvidence}
          sourceCopyMessage={sourceCopyMessage}
        />
      )}

      {results.length > 0 && (
        <ol className="evidence-list">
          {groupSimilarResults ? <>
            {keywordResults.map((item) => <li key={item.source.chunk_id}>{evidenceCard(item)}</li>)}
            <li className="similar-results-item">
              <details className="similar-results" data-detail-return-disclosure="similar-results">
                <summary>비슷한 내용 {similarResults.length}개 더 보기</summary>
                <ol className="evidence-list similar-evidence-list">
                  {similarResults.map(item => <li key={item.source.chunk_id}>{evidenceCard(item)}</li>)}
                </ol>
              </details>
            </li>
          </> : rankedResults.map(item => <li key={item.source.chunk_id}>{evidenceCard(item)}</li>)}
        </ol>
      )}
      {searchMessage === '관련 내용을 찾지 못했어요.' && !chatResult && (
        <>
          <div className="no-results">
            <Search size={18} />
            <div className="no-results-copy">
              <strong role="status" aria-live="polite">관련 내용을 찾지 못했어요.</strong>
              <span>표현을 바꿔 다시 찾거나 문서함에서 자료를 확인해 보세요.</span>
            </div>
            <div className="no-results-actions">
              {canTryOtherSearchMode && <button type="button" disabled={busy} onClick={onTryOtherSearchMode}>{alternativeSearchLabel}</button>}
              {isDocumentScoped && hasOtherSearchableDocuments && <button type="button" disabled={busy} onClick={() => onSearchAll(query)}><Search size={13} /> 전체 문서에서 다시 찾기</button>}
              <button type="button" onClick={onBrowseDocuments}>문서함 보기 <ArrowUpRight size={14} /></button>
            </div>
          </div>
          <RecentSearchRecovery searches={recentSearches} busy={busy} canRepeatSearch={canRepeatSearch} onRepeat={onRepeatSearch} onViewHistory={onViewSearchHistory} onClear={onClearRecentSearches} />
        </>
      )}
      {results.length > 0 && <p className="search-footnote">결과는 실제 문서에서 가져온 발췌문입니다.</p>}
    </section>
  )
}
