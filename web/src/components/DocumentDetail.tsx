import { ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FileText, MessageCircleQuestion, RotateCw, Search, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { getDocumentChunkSummary, getDocumentLifecycle } from '../documentStatus'
import { preferredScrollBehavior } from '../scrollBehavior'
import { isImeCompositionEvent, shouldClearSearchOnEscape } from '../keyboardInput.mjs'
import { documentUrl, isPlainLeftClick } from '../documentLinks.mjs'
import HighlightedExcerpt from './HighlightedExcerpt'
import type { Doc, DocDetail, DocOutline, SearchResult } from '../types'

const API = import.meta.env.VITE_API_URL ?? ''
const DOCUMENT_OUTLINE_MIN_CHUNKS = 12
const DOCUMENT_OUTLINE_PAGE_SIZE = 12
const DOCUMENT_SEARCH_PAGE_SIZE = 10
const DOCUMENT_SEARCH_MAX_OFFSET = 1000

type DocumentDetailProps = {
  document: Doc | null
  documentNameFor: (document: Doc) => string
  relatedDocuments: Doc[]
  detail: DocDetail | null
  outlineRevision: number
  selectedExcerpt: string | null
  selectedChunkIndex: number | null
  selectedQuery: string | null
  previewUnavailable: boolean
  originalDownloadAvailable: boolean
  loading: boolean
  busy: boolean
  notice: string
  isFavorite: boolean
  hasOtherSearchableDocuments: boolean
  backLabel: string
  onAskAboutDocument: (document: Doc, initialQuery?: string) => void
  onSearchAll: (query: string) => void
  onRetryDetail: () => void
  onBack: () => void
  onBrowseDocuments: () => void
  onOpenRelatedDocument: (document: Doc) => void
  onToggleFavorite: (documentId: string) => void
  onIndex: (doc: Doc) => void
  onRetryExtraction: (doc: Doc) => void
  onDelete: (doc: Doc) => void
  onLoadChunkPage: (offset: number) => void
  onNavigateToChunk: (chunkIndex: number) => void
}

function DocumentSummary({ detail }: { detail: DocDetail }) {
  const lifecycle = getDocumentLifecycle(detail.status, detail.index_status)
  const searchStatus = lifecycle === 'searchable'
    ? '검색 가능'
    : lifecycle === 'extract_failed'
      ? '파일 읽기 실패'
      : lifecycle === 'index_failed'
        ? '다시 처리 필요'
        : detail.status === 'processing'
          ? '파일 읽는 중'
          : '검색 준비 중'
  return (
    <div className="detail-summary">
      <div>
        <span>읽은 내용</span>
        <strong>{getDocumentChunkSummary(detail)}</strong>
      </div>
      <div>
        <span>검색 상태</span>
        <strong className={`detail-summary-status status-${lifecycle}`}>{searchStatus}</strong>
      </div>
      <div>
        <span>추가한 날짜</span>
        <strong>{new Date(detail.created_at).toLocaleDateString('ko-KR')}</strong>
      </div>
    </div>
  )
}

function FindInDocument({ document, navigationBusy, hasOtherSearchableDocuments, onNavigateToChunk, onSearchAll }: { document: Doc; navigationBusy: boolean; hasOtherSearchableDocuments: boolean; onNavigateToChunk: (chunkIndex: number) => void; onSearchAll: (query: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [message, setMessage] = useState('')
  const [failedOffset, setFailedOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ F' : 'Ctrl F'

  useEffect(() => {
    function focusDocumentFind(event: KeyboardEvent) {
      if (isImeCompositionEvent(event)) return
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="alertdialog"]')) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', focusDocumentFind)
    return () => window.removeEventListener('keydown', focusDocumentFind)
  }, [])

  useEffect(() => () => {
    requestRef.current += 1
    controllerRef.current?.abort()
  }, [])

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery)
    setSearched(false)
    setMessage('')
    if (controllerRef.current) {
      requestRef.current += 1
      controllerRef.current.abort()
      controllerRef.current = null
      setLoading(false)
    }
  }

  function clearQueryOnEscape(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!shouldClearSearchOnEscape(event.nativeEvent, Boolean(query))) return
    event.preventDefault()
    changeQuery('')
  }

  async function find(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = query.trim()
    if (!term || loading) return
    setResults([])
    setTotal(0)
    setOffset(0)
    setFailedOffset(null)
    setSearched(false)
    await loadResults(term, 0)
  }

  async function loadResults(term: string, nextOffset: number) {
    if (!term || loading) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = ++requestRef.current
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000)
    setLoading(true)
    setMessage('')
    setFailedOffset(null)
    try {
      const params = new URLSearchParams({ q: term, offset: String(nextOffset), limit: String(DOCUMENT_SEARCH_PAGE_SIZE) })
      const response = await fetch(`${API}/api/documents/${document.id}/search?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (requestId !== requestRef.current) return
      if (!response.ok) throw new Error(typeof payload?.detail === 'string' ? payload.detail : '이 문서에서 찾지 못했습니다. 다시 시도해 주세요.')
      setResults(Array.isArray(payload.results) ? payload.results as SearchResult[] : [])
      setTotal(Number.isFinite(payload.total) ? payload.total : 0)
      setOffset(nextOffset)
      setSearched(true)
    } catch (error) {
      if (requestId !== requestRef.current) return
      setFailedOffset(nextOffset)
      if (nextOffset === 0) {
        setResults([])
        setTotal(0)
        setOffset(0)
      }
      setSearched(true)
      setMessage(controller.signal.aborted
        ? '문서 검색이 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요.'
        : error instanceof TypeError
          ? '문서를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
          : error instanceof Error
            ? error.message
            : '문서에서 찾지 못했습니다.')
    } finally {
      window.clearTimeout(timeoutId)
      if (requestId === requestRef.current) {
        controllerRef.current = null
        setLoading(false)
      }
    }
  }

  return (
    <section className="document-find" aria-labelledby="document-find-title">
      <div className="document-find-heading">
        <div><span className="section-overline">문서 안에서 찾기</span><h2 id="document-find-title">이 문서에서 다시 찾아보세요</h2></div>
        <span>현재 문서의 추출 텍스트만 검색합니다 <kbd>{shortcutLabel}</kbd></span>
      </div>
      <form className="document-find-form" role="search" aria-label="현재 문서 안에서 찾기" onSubmit={event => void find(event)}>
        <Search size={17} aria-hidden="true" />
        <input ref={inputRef} value={query} aria-keyshortcuts="Control+F Meta+F Escape" onChange={event => changeQuery(event.target.value)} onKeyDown={clearQueryOnEscape} placeholder="단어 또는 문장 입력" aria-label="현재 문서에서 찾을 내용" maxLength={2000} />
        {query && <button className="document-find-clear" type="button" aria-label="현재 문서 검색어 지우기" title="검색어 지우기" onClick={() => { changeQuery(''); inputRef.current?.focus() }}><X size={14} aria-hidden="true" /></button>}
        <button className="button-secondary" type="submit" disabled={!query.trim() || loading}>{loading ? '찾는 중…' : '찾기'}</button>
      </form>
      {message && <div className="document-find-message">
        <p role="alert" aria-live="assertive">{message}</p>
        {failedOffset !== null && <button type="button" onClick={() => void loadResults(query.trim(), failedOffset)}>다시 시도</button>}
      </div>}
      {searched && total > 0 && <div className="document-find-results" aria-busy={loading}>
        <p role="status" aria-live="polite" aria-atomic="true">{total > results.length ? `검색 결과 ${total}개 · ${offset + 1}–${Math.min(offset + results.length, total)}개 표시` : `검색 결과 ${total}개`}{loading && ' · 결과 페이지를 불러오는 중'}</p>
        <ul>{results.map(source => <li key={source.chunk_id}>
          <button type="button" disabled={loading || navigationBusy} aria-label={`${source.filename} ${source.page_number ? `페이지 ${source.page_number}` : source.section_path || `구간 ${source.chunk_index + 1}`} 내용으로 이동`} title={navigationBusy ? '문서 내용을 불러오고 있습니다.' : undefined} onClick={() => onNavigateToChunk(source.chunk_index)}>
            <span><strong>{source.page_number ? `페이지 ${source.page_number}` : source.section_path || `구간 ${source.chunk_index + 1}`}</strong><small>구간 {source.chunk_index + 1}</small></span>
            <p><HighlightedExcerpt text={source.excerpt} query={query} /></p>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </li>)}</ul>
        {total > DOCUMENT_SEARCH_PAGE_SIZE && <nav className="document-find-pagination" aria-label="문서 안 검색 결과 페이지">
          <span>{Math.floor(offset / DOCUMENT_SEARCH_PAGE_SIZE) + 1} / {Math.ceil(Math.min(total, DOCUMENT_SEARCH_MAX_OFFSET + DOCUMENT_SEARCH_PAGE_SIZE) / DOCUMENT_SEARCH_PAGE_SIZE)}페이지{total > DOCUMENT_SEARCH_MAX_OFFSET + DOCUMENT_SEARCH_PAGE_SIZE - 1 && <> · 상위 {DOCUMENT_SEARCH_MAX_OFFSET + DOCUMENT_SEARCH_PAGE_SIZE}개</>}</span>
          <div>
            <button type="button" disabled={loading || offset === 0} onClick={() => void loadResults(query.trim(), Math.max(0, offset - DOCUMENT_SEARCH_PAGE_SIZE))}>이전 결과</button>
            <button type="button" disabled={loading || offset + results.length >= total || offset >= DOCUMENT_SEARCH_MAX_OFFSET} onClick={() => void loadResults(query.trim(), Math.min(DOCUMENT_SEARCH_MAX_OFFSET, offset + DOCUMENT_SEARCH_PAGE_SIZE))}>다음 결과</button>
          </div>
        </nav>}
      </div>}
      {!message && searched && total === 0 && results.length === 0 && !loading && <div className="document-find-empty" role="status" aria-live="polite" aria-atomic="true"><span>{hasOtherSearchableDocuments ? '이 문서에서는 찾지 못했어요. 다른 문서에서도 확인해 보세요.' : '이 문서에서는 찾지 못했어요. 다른 표현으로 다시 찾아보세요.'}</span>{hasOtherSearchableDocuments && <button type="button" onClick={() => onSearchAll(query.trim())}>모든 문서에서 찾기 <ArrowUpRight size={13}/></button>}</div>}
    </section>
  )
}

function outlineSectionsFrom(payload: unknown): DocOutline['sections'] {
  if (!payload || typeof payload !== 'object') return []
  const sections = (payload as { sections?: unknown }).sections
  if (!Array.isArray(sections)) return []
  return sections.filter((section: unknown): section is DocOutline['sections'][number] =>
    !!section && typeof section === 'object' &&
    typeof (section as { title?: unknown }).title === 'string' &&
    Number.isFinite((section as { chunk_count?: unknown }).chunk_count) &&
    Number.isFinite((section as { first_chunk_index?: unknown }).first_chunk_index),
  )
}

function moreOutlineSectionsFrom(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0
  const more = (payload as { more_sections?: unknown }).more_sections
  return Number.isSafeInteger(more) && (more as number) > 0 ? more as number : 0
}

function DocumentOutlineNav({ document, chunkCount, currentChunkIndex, selectedChunkIndex, disabled, onNavigateToChunk }: {
  document: Doc
  chunkCount: number
  currentChunkIndex: number
  selectedChunkIndex: number | null
  disabled: boolean
  onNavigateToChunk: (chunkIndex: number) => void
}) {
  const [sections, setSections] = useState<DocOutline['sections']>([])
  const [moreSections, setMoreSections] = useState(0)
  const [outlineLoading, setOutlineLoading] = useState(false)
  const [outlineLoadingMore, setOutlineLoadingMore] = useState(false)
  const [outlineError, setOutlineError] = useState(false)
  const [moreSectionsError, setMoreSectionsError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [visibleChunkIndex, setVisibleChunkIndex] = useState<number | null>(null)
  const [revealChunkIndex, setRevealChunkIndex] = useState<number | null>(null)
  const outlineLinksRef = useRef<HTMLDivElement>(null)
  const moreSectionsControllerRef = useRef<AbortController | null>(null)
  const activeDocumentIdRef = useRef(document.id)
  activeDocumentIdRef.current = document.id
  const activeIndex = visibleChunkIndex ?? selectedChunkIndex ?? currentChunkIndex
  const activeSection = sections.filter(section => section.first_chunk_index <= activeIndex).at(-1)

  useEffect(() => {
    if (chunkCount <= DOCUMENT_OUTLINE_MIN_CHUNKS) return
    const controller = new AbortController()
    let active = true
    setSections([])
    setMoreSections(0)
    setOutlineLoading(true)
    setOutlineError(false)
    setOutlineLoadingMore(false)
    setMoreSectionsError(false)
    void fetch(`${API}/api/documents/${document.id}/outline?limit=${DOCUMENT_OUTLINE_PAGE_SIZE}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('목차를 불러오지 못했습니다.')
        return response.json()
      })
      .then(payload => {
        if (!Array.isArray(payload?.sections)) throw new Error('문서 목차 응답이 올바르지 않습니다.')
        setSections(outlineSectionsFrom(payload))
        setMoreSections(moreOutlineSectionsFrom(payload))
        setMoreSectionsError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted && active) {
          setSections([])
          setMoreSections(0)
          setOutlineError(true)
        }
      })
      .finally(() => {
        if (active) setOutlineLoading(false)
      })
    return () => { active = false; controller.abort() }
  }, [document.id, chunkCount, retryCount])

  useEffect(() => () => { moreSectionsControllerRef.current?.abort() }, [document.id])

  async function loadMoreSections() {
    if (outlineLoadingMore || moreSections <= 0) return
    const requestedDocumentId = document.id
    const controller = new AbortController()
    moreSectionsControllerRef.current?.abort()
    moreSectionsControllerRef.current = controller
    setOutlineLoadingMore(true)
    setMoreSectionsError(false)
    try {
      const response = await fetch(`${API}/api/documents/${document.id}/outline?limit=${DOCUMENT_OUTLINE_PAGE_SIZE}&offset=${sections.length}`, { signal: controller.signal, cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !Array.isArray(payload?.sections)) throw new Error('문서 목차를 더 불러오지 못했습니다.')
      if (controller.signal.aborted || activeDocumentIdRef.current !== requestedDocumentId) return
      const nextSections = outlineSectionsFrom(payload)
      setSections(current => {
        const known = new Set(current.map(section => `${section.first_chunk_index}:${section.title}`))
        return [...current, ...nextSections.filter(section => !known.has(`${section.first_chunk_index}:${section.title}`))]
      })
      if (nextSections.length > 0) setRevealChunkIndex(nextSections[0].first_chunk_index)
      setMoreSections(moreOutlineSectionsFrom(payload))
    } catch {
      if (!controller.signal.aborted && activeDocumentIdRef.current === requestedDocumentId) setMoreSectionsError(true)
    } finally {
      if (!controller.signal.aborted && activeDocumentIdRef.current === requestedDocumentId) {
        if (moreSectionsControllerRef.current === controller) moreSectionsControllerRef.current = null
        setOutlineLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const content = window.document.querySelector<HTMLElement>('.detail-content')
    if (!content) return
    const chunks = [...content.querySelectorAll<HTMLElement>('.text-chunk[id^="chunk-"]')]
    if (chunks.length === 0) return
    setVisibleChunkIndex(null)
    const stickyNav = window.document.querySelector<HTMLElement>('.detail-outline')
    const stickyTop = stickyNav ? Number.parseFloat(window.getComputedStyle(stickyNav).top) || 84 : 84
    const topInset = Math.round(stickyTop + (stickyNav?.offsetHeight ?? 0) + 12)
    const observer = new IntersectionObserver(entries => {
      const current = entries
        .filter(entry => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0]
      const match = current?.target.id.match(/^chunk-(\d+)$/u)
      if (match) setVisibleChunkIndex(Number(match[1]) - 1)
    }, { rootMargin: `-${topInset}px 0px -68% 0px`, threshold: 0 })
    chunks.forEach(chunk => observer.observe(chunk))
    return () => observer.disconnect()
  }, [document.id, chunkCount, currentChunkIndex, selectedChunkIndex])

  useEffect(() => {
    if (revealChunkIndex === null) return
    outlineLinksRef.current?.querySelector<HTMLButtonElement>(`[data-outline-section="${revealChunkIndex}"]`)
      ?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest', inline: 'start' })
    setRevealChunkIndex(null)
  }, [revealChunkIndex, sections])

  useEffect(() => {
    if (!activeSection) return
    const activeLink = outlineLinksRef.current?.querySelector<HTMLButtonElement>('[aria-current="location"]')
    const links = outlineLinksRef.current
    if (!links || !activeLink) return
    const linksBounds = links.getBoundingClientRect()
    const activeBounds = activeLink.getBoundingClientRect()
    if (activeBounds.left < linksBounds.left || activeBounds.right > linksBounds.right) {
      activeLink.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest', inline: 'nearest' })
    }
  }, [activeSection?.first_chunk_index])

  if (chunkCount <= DOCUMENT_OUTLINE_MIN_CHUNKS) return null
  if (outlineError) return <div className="detail-outline-message">
    <span role="alert" aria-live="assertive">문서 목차를 불러오지 못했어요.</span>
    <button type="button" onClick={() => setRetryCount(count => count + 1)}><RotateCw size={12} /> 다시 불러오기</button>
  </div>
  if (sections.length < 2) return outlineLoading
    ? <div className="detail-outline-message" role="status">문서 목차를 불러오는 중…</div>
    : null
  const currentChunkNumber = Math.min(chunkCount, Math.max(1, activeIndex + 1))

  return (
    <nav className="detail-outline" aria-label="문서 목차">
      <span className="detail-outline-label">목차</span>
      <span className="detail-outline-position" title={`문서 구간 ${currentChunkNumber} / ${chunkCount}`}>{currentChunkNumber} / {chunkCount}</span>
      <div className="detail-outline-links" ref={outlineLinksRef}>
        {sections.map(section => <button
          key={`${section.first_chunk_index}-${section.title}`}
          type="button"
          data-outline-section={section.first_chunk_index}
          disabled={disabled}
          aria-current={activeSection?.first_chunk_index === section.first_chunk_index ? 'location' : undefined}
          title={`${section.title} · ${section.chunk_count}개 구간`}
          onClick={() => onNavigateToChunk(section.first_chunk_index)}
        >{section.title}</button>)}
      </div>
      {moreSections > 0 && <button
        className="detail-outline-more"
        type="button"
        disabled={disabled || outlineLoadingMore}
        aria-live="polite"
        aria-label={outlineLoadingMore ? '문서 목차를 불러오는 중' : `${moreSectionsError ? '목차 다시 불러오기' : '목차 더 불러오기'}, ${moreSections}개 남음`}
        title={moreSectionsError ? '목차를 불러오지 못했습니다. 다시 시도해 주세요.' : `${moreSections}개 목차가 더 있습니다.`}
        onClick={() => void loadMoreSections()}
      >{outlineLoadingMore ? '불러오는 중…' : moreSectionsError ? '다시 시도' : '더 보기'}</button>}
    </nav>
  )
}

function ExtractedChunks({ detail, document, filename, loading, selectedChunkIndex, selectedQuery, canAsk, onAskAboutDocument, onLoadChunkPage }: { detail: DocDetail; document: Doc; filename: string; loading: boolean; selectedChunkIndex: number | null; selectedQuery: string | null; canAsk: boolean; onAskAboutDocument: (document: Doc, initialQuery?: string) => void; onLoadChunkPage: (offset: number) => void }) {
  const offset = detail.chunk_offset ?? 0
  const pageSize = detail.chunk_limit || detail.chunks.length
  const end = offset + detail.chunks.length
  const contentRef = useRef<HTMLDivElement>(null)
  const previousOffset = useRef(offset)
  const copyTimer = useRef<number | null>(null)
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null)
  const [copyError, setCopyError] = useState('')
  const [copyAnnouncement, setCopyAnnouncement] = useState('')

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
  }, [])

  async function copyChunk(chunk: DocDetail['chunks'][number]) {
    const location = chunk.page_number ? `페이지 ${chunk.page_number}` : chunk.section_path || '본문'
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current)
      copyTimer.current = null
    }
    setCopiedChunkId(null)
    setCopyError('')
    setCopyAnnouncement('')
    try {
      await navigator.clipboard.writeText(`${filename} · ${location} · 구간 ${chunk.chunk_index + 1}\n${chunk.content}`)
      setCopiedChunkId(chunk.id)
      setCopyError('')
      setCopyAnnouncement(`${filename} · ${location} · 구간 ${chunk.chunk_index + 1}을 복사했습니다.`)
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => {
        setCopiedChunkId(null)
        setCopyAnnouncement('')
      }, 2200)
    } catch {
      setCopyError('클립보드에 접근하지 못했어요. 문장을 직접 선택해 복사해 주세요.')
      setCopyAnnouncement('')
    }
  }

  useEffect(() => {
    if (previousOffset.current !== offset && selectedChunkIndex === null) {
      contentRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' })
      contentRef.current?.querySelector<HTMLElement>(`#chunk-${offset + 1}`)?.focus({ preventScroll: true })
    }
    previousOffset.current = offset
  }, [offset, selectedChunkIndex])

  useEffect(() => {
    if (selectedChunkIndex === null) return
    const selectedChunk = contentRef.current?.querySelector<HTMLElement>('[aria-current="location"]')
    selectedChunk?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center' })
    selectedChunk?.focus({ preventScroll: true })
  }, [detail.chunk_offset, detail.chunks.length, selectedChunkIndex])

  return (
    <div className="detail-content" ref={contentRef}>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{copyAnnouncement}</span>
      <div className="detail-content-heading">
        <h2>문서 내용</h2>
        {selectedQuery ? <div className="detail-content-search-context">
          <span>검색 질문과 일치하는 표현을 강조했어요.</span>
          <details className="detail-search-query">
            <summary>질문 보기 <ChevronDown size={12} aria-hidden="true" /></summary>
            <p>{selectedQuery}</p>
          </details>
        </div> : <span>파일에서 읽은 순서대로 보여드립니다</span>}
      </div>
      {detail.chunks.map(chunk => (
        <article id={`chunk-${chunk.chunk_index + 1}`} className={`text-chunk ${chunk.chunk_index === selectedChunkIndex ? 'selected-chunk' : ''}`} key={chunk.id} tabIndex={chunk.chunk_index === selectedChunkIndex || chunk.chunk_index === offset ? -1 : undefined} aria-label={`${filename} · ${chunk.page_number ? `페이지 ${chunk.page_number}` : chunk.section_path || '본문'} · 구간 ${chunk.chunk_index + 1}`} aria-current={chunk.chunk_index === selectedChunkIndex ? 'location' : undefined}>
          <div>
            <span>{chunk.chunk_index === selectedChunkIndex ? `구간 ${chunk.chunk_index + 1} · 찾은 위치` : `구간 ${chunk.chunk_index + 1}`}</span>
            <span>{chunk.page_number ? `페이지 ${chunk.page_number}` : chunk.section_path || '본문'}</span>
            <button className="chunk-copy" onClick={() => void copyChunk(chunk)} aria-label={`${filename} 구간 ${chunk.chunk_index + 1} 복사`} title="문서 위치와 함께 복사">
              {copiedChunkId === chunk.id ? <Check size={12} /> : <Copy size={12} />}
              {copiedChunkId === chunk.id ? '복사됨' : '복사'}
            </button>
            <button className="chunk-ask" type="button" disabled={!canAsk || loading} aria-label={`${filename} ${chunk.section_path || (chunk.page_number ? `페이지 ${chunk.page_number}` : `구간 ${chunk.chunk_index + 1}`)} 내용을 질문하기`} title="이 구간을 기준으로 질문 초안을 만듭니다" onClick={() => {
              const location = (chunk.section_path || (chunk.page_number ? `페이지 ${chunk.page_number}` : `구간 ${chunk.chunk_index + 1}`)).slice(0, 80)
              onAskAboutDocument(document, `“${location}” 구간의 핵심 내용과 관련 근거를 알려줘.`)
            }}><MessageCircleQuestion size={12} aria-hidden="true" /><span>질문</span></button>
          </div>
          <p>{chunk.chunk_index === selectedChunkIndex && selectedQuery
            ? <HighlightedExcerpt text={chunk.content} query={selectedQuery} />
            : chunk.content}</p>
        </article>
      ))}
      {copyError && <p className="detail-copy-error" role="status" aria-live="polite">{copyError}</p>}
      {detail.chunk_count > pageSize && (
        <nav className="chunk-pagination" aria-label="추출한 문서 구간 페이지 이동">
          <button className="button-secondary" disabled={loading || offset <= 0} onClick={() => onLoadChunkPage(Math.max(0, offset - pageSize))}>
            <ChevronLeft size={14} /> 이전
          </button>
          <span aria-live="polite">{loading ? '구간을 불러오는 중…' : `${detail.chunks.length ? `${offset + 1}–${end}` : '0'} / ${detail.chunk_count}개 구간`}</span>
          <button className="button-secondary" disabled={loading || end >= detail.chunk_count} onClick={() => onLoadChunkPage(end)}>
            다음 <ChevronRight size={14} />
          </button>
        </nav>
      )}
    </div>
  )
}

export default function DocumentDetail({
  document,
  documentNameFor,
  detail,
  outlineRevision,
  selectedExcerpt,
  selectedChunkIndex,
  selectedQuery,
  previewUnavailable,
  originalDownloadAvailable,
  loading,
  busy,
  notice,
  isFavorite,
  hasOtherSearchableDocuments,
  backLabel,
  onAskAboutDocument,
  onSearchAll,
  onRetryDetail,
  onBack,
  onBrowseDocuments,
  relatedDocuments,
  onOpenRelatedDocument,
  onToggleFavorite,
  onIndex,
  onRetryExtraction,
  onDelete,
  onLoadChunkPage,
  onNavigateToChunk,
}: DocumentDetailProps) {
  const documentLifecycle = document ? getDocumentLifecycle(document.status, document.index_status) : null
  const sourceDocumentMissing = /문서를 찾을 수 없습니다/iu.test(notice)
  const emptyDetailMessage = documentLifecycle === 'extract_failed'
    ? '원본 파일에서 본문을 읽지 못했습니다. 위의 “다시 읽기”를 눌러 다시 처리해 보세요.'
    : documentLifecycle === 'index_failed'
      ? '본문은 확인했지만 검색에 필요한 구간을 준비하지 못했습니다. 위의 “다시 검색 준비”를 눌러 보세요.'
      : documentLifecycle === 'processing'
        ? '문서 내용을 준비하고 있습니다. 처리가 끝나면 본문을 확인할 수 있습니다.'
        : document?.file_type === 'pdf'
          ? '추출할 텍스트가 없습니다. 스캔 이미지로 된 PDF라면 OCR을 적용한 파일을 다시 올려 주세요.'
          : '문서에 추출할 텍스트가 없습니다. 원본 파일에 실제 문장이 들어 있는지 확인해 주세요.'
  const relatedLifecycleLabel = (doc: Doc) => {
    const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
    return lifecycle === 'searchable' ? '검색 가능' : lifecycle === 'processing' ? '준비 중' : '확인 필요'
  }
  function recoverDocument(event: MouseEvent<HTMLButtonElement>, action: (document: Doc) => void) {
    if (!document) return
    if (event.detail === 0) {
      event.currentTarget.closest('.detail-heading')?.querySelector<HTMLHeadingElement>('.detail-title h1')?.focus({ preventScroll: true })
    }
    action(document)
  }
  return (
    <section className={`document-detail${selectedExcerpt !== null ? ' has-source-return' : ''}`}>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> {backLabel}
      </button>

      <div className="detail-heading">
        <div className={`file-icon file-${document?.file_type ?? 'txt'}`}>
          <FileText size={21} />
        </div>
        <div className="detail-title">
          <span className="section-overline">문서 내용</span>
          <h1 tabIndex={-1}>{document?.filename ?? '문서'}</h1>
          {document && <p>{document.file_type.toUpperCase()} 문서</p>}
        </div>
        <div className="detail-actions">
          {document && <button
            className="button-primary ask-detail"
            type="button"
            disabled={busy || loading || documentLifecycle !== 'searchable'}
            title={documentLifecycle === 'searchable' ? `문서 범위를 지정해 ${document.filename}에 질문합니다.` : '검색 준비가 끝난 뒤 질문할 수 있습니다.'}
            onClick={() => onAskAboutDocument(document)}
          ><MessageCircleQuestion size={14} /> 이 문서에 질문하기</button>}
          {document && <button
            className={`button-secondary favorite-detail ${isFavorite ? 'active' : ''}`}
            aria-label={document ? `${documentNameFor(document)} ${isFavorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}` : isFavorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(document.id)}
          ><Star size={14} fill={isFavorite ? 'currentColor' : 'none'} /> {isFavorite ? '저장됨' : '즐겨찾기'}</button>}
          {document && originalDownloadAvailable && (
            <a className="button-secondary" href={`${API}/api/documents/${document.id}/file`}>
              <Download size={14} /> 원본 받기
            </a>
          )}
          {document && documentLifecycle === 'index_failed' && (
              <button className="button-secondary" aria-label={`${documentNameFor(document)} 검색 준비 다시 처리`} disabled={busy} onClick={event => recoverDocument(event, onIndex)}>
              <RotateCw size={14} /> 다시 검색 준비
            </button>
          )}
          {document && documentLifecycle === 'extract_failed' && (
            <button className="button-secondary" aria-label={`${documentNameFor(document)} 원본 다시 읽기`} disabled={busy} onClick={event => recoverDocument(event, onRetryExtraction)} title="저장된 원본 파일에서 텍스트를 다시 읽습니다.">
              <RotateCw size={14} /> 다시 읽기
            </button>
          )}
          {document && (
            <button className="detail-delete" aria-label={`${documentNameFor(document)} 삭제`} disabled={busy} onClick={() => onDelete(document)}>
              <Trash2 size={15} /> 삭제
            </button>
          )}
        </div>
      </div>

      {notice && <div className="notice" role="status">{notice}</div>}
      {loading && !detail ? (
        <div className="detail-loading" role="status">문서 내용을 불러오는 중입니다…</div>
      ) : detail ? (
        <>
          <DocumentSummary detail={detail} />
          {document && detail.chunk_count > 0 && <FindInDocument key={document.id} document={document} navigationBusy={loading} hasOtherSearchableDocuments={hasOtherSearchableDocuments} onNavigateToChunk={onNavigateToChunk} onSearchAll={onSearchAll} />}
          {document && <DocumentOutlineNav key={`${document.id}:${outlineRevision}`} document={document} chunkCount={detail.chunk_count} currentChunkIndex={detail.chunk_offset} selectedChunkIndex={selectedChunkIndex} disabled={loading} onNavigateToChunk={onNavigateToChunk} />}
          {detail.error_message && <div className="chat-error" role={detail.status === 'failed' ? 'alert' : 'status'}>{detail.error_message}</div>}
          {selectedExcerpt && !detail?.chunks.some(chunk => chunk.chunk_index === selectedChunkIndex) && (
            <article className="text-chunk selected-excerpt">
              <div><span>검색에서 확인한 발췌</span></div>
              <p>{selectedExcerpt}</p>
            </article>
          )}
          {detail.chunks.length > 0 && document ? (
            <ExtractedChunks key={detail.id} detail={detail} document={document} filename={document.filename} loading={loading} selectedChunkIndex={selectedChunkIndex} selectedQuery={selectedQuery} canAsk={documentLifecycle === 'searchable' && !busy} onAskAboutDocument={onAskAboutDocument} onLoadChunkPage={onLoadChunkPage} />
          ) : previewUnavailable ? (
            <div className="detail-empty detail-preview-note">
              <strong>문서 등록 정보</strong>
              <p>이 문서의 검색 결과에서 원문 발췌를 확인할 수 있습니다.</p>
              {!selectedExcerpt && (
                <button className="plain-link" onClick={onBack}>
                  문서함으로 돌아가기 <ChevronRight size={15} />
                </button>
              )}
            </div>
          ) : (
            <div className="empty detail-empty">
              <span className="empty-illustration"><FileText size={23} /></span>
              <strong>{documentLifecycle === 'processing' ? '문서 처리 중입니다' : documentLifecycle === 'extract_failed' ? '본문을 읽지 못했어요' : documentLifecycle === 'index_failed' ? '검색 준비가 필요해요' : '표시할 텍스트가 없습니다'}</strong>
              <span>{emptyDetailMessage}</span>
            </div>
          )}
        </>
      ) : (
        <div className="empty detail-empty" aria-live="polite">
          <span className="empty-illustration"><FileText size={23} /></span>
          <strong>{sourceDocumentMissing ? '원문 문서를 찾을 수 없습니다' : '문서 내용을 불러오지 못했습니다'}</strong>
          <span>{sourceDocumentMissing
            ? '문서가 삭제됐거나 현재 계정에서 접근할 수 없습니다. 저장한 근거에 보관한 발췌가 있다면 계속 확인할 수 있습니다.'
            : '위 안내를 확인한 뒤 다시 시도하거나 이전 화면으로 돌아가세요.'}</span>
          {sourceDocumentMissing && selectedExcerpt && <blockquote className="detail-unavailable-excerpt"><strong>검색에서 확인한 발췌</strong><span>{selectedExcerpt}</span></blockquote>}
          {document && <button className="button-secondary" disabled={busy || loading} onClick={onRetryDetail}><RotateCw size={14} /> 다시 불러오기</button>}
          <button className="plain-link" onClick={onBack}>{backLabel} <ChevronRight size={15} /></button>
        </div>
      )}
      {document && relatedDocuments.length > 0 && <section className="detail-related-documents" aria-labelledby="detail-related-title">
        <div className="detail-related-heading">
          <div><span className="section-overline">다른 문서</span><h2 id="detail-related-title">이어서 살펴보기</h2></div>
          <span>최근에 열어본 자료와 문서함 항목</span>
        </div>
        <div className="detail-related-grid">
          {relatedDocuments.map(doc => {
            const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
            const documentName = documentNameFor(doc)
            return <article className="detail-related-card" key={doc.id}>
              <a className="detail-related-open" href={documentUrl(doc.id)} onClick={event => {
                if (isPlainLeftClick(event)) {
                  event.preventDefault()
                  onOpenRelatedDocument(doc)
                }
              }} title={`${documentName} 열기`}>
                <span className={`file-icon file-${doc.file_type}`}><FileText size={16}/></span>
                <span><strong>{doc.filename}</strong><small>{new Date(doc.created_at).toLocaleDateString('ko-KR')} · {getDocumentChunkSummary(doc)}</small></span>
                <ArrowUpRight size={14} aria-hidden="true"/>
              </a>
              <div className="detail-related-footer">
                <span className={`detail-related-status ${lifecycle === 'searchable' ? 'ready' : lifecycle === 'processing' ? 'pending' : 'attention'}`}>{relatedLifecycleLabel(doc)}</span>
                {lifecycle === 'extract_failed' ? <button type="button" disabled={busy} aria-label={`${documentName} 원본 다시 읽기`} title="저장된 원본 파일에서 텍스트를 다시 읽습니다." onClick={() => onRetryExtraction(doc)}><RotateCw size={12}/> 다시 읽기</button>
                  : lifecycle === 'index_failed' ? <button type="button" disabled={busy} aria-label={`${documentName} 검색 준비 다시 처리`} title="읽어 둔 본문으로 검색 준비를 다시 시도합니다." onClick={() => onIndex(doc)}><RotateCw size={12}/> 다시 준비</button>
                    : <button type="button" aria-label={`${documentName}에서 질문하기`} disabled={busy || lifecycle !== 'searchable'} title={lifecycle === 'searchable' ? `${documentName}만 검색 범위로 질문합니다.` : '검색 준비가 끝난 뒤 질문할 수 있어요.'} onClick={() => onAskAboutDocument(doc)}>이 문서에 질문</button>}
              </div>
            </article>
          })}
        </div>
      </section>}
      {document && documentLifecycle === 'searchable' && relatedDocuments.length === 0 && <section className="detail-next-step" aria-labelledby="detail-next-step-title">
        <div>
          <span className="section-overline">자료 더 찾기</span>
          <h2 id="detail-next-step-title">다른 자료와 함께 살펴보기</h2>
          <p>문서함에서 자료를 더 추가하면 여러 문서의 근거를 나란히 확인할 수 있어요.</p>
        </div>
        <button type="button" onClick={onBrowseDocuments}>문서함 둘러보기 <ArrowUpRight size={14} aria-hidden="true" /></button>
      </section>}
      {selectedExcerpt !== null && <div className="detail-source-return" role="group" aria-label="원문을 연 위치로 돌아가기">
        <div>
          <small>{selectedQuery ? '검색 질문' : '확인 중인 구간'}</small>
          <strong title={selectedQuery ?? `구간 ${selectedChunkIndex === null ? 1 : selectedChunkIndex + 1}`}>
            {selectedQuery ?? `구간 ${selectedChunkIndex === null ? 1 : selectedChunkIndex + 1}`}
          </strong>
        </div>
        <button type="button" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> {backLabel}</button>
      </div>}
    </section>
  )
}
