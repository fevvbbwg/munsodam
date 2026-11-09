import { ArrowRight, ChevronLeft, ChevronRight, FileText, RefreshCw, RotateCcw, RotateCw, Search, Star, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { getDocumentChunkSummary, getDocumentLifecycle } from '../documentStatus'
import { createTextQueryMatcher } from '../textQuery.mjs'
import { documentUrl, isPlainLeftClick } from '../documentLinks.mjs'
import { shouldClearSearchOnEscape } from '../keyboardInput.mjs'
import type { Doc } from '../types'

const FAVORITES_PAGE_SIZE = 20
type FavoriteStatusFilter = 'all' | 'searchable' | 'processing' | 'attention' | 'index_failed' | 'extract_failed'

export default function FavoritesPage({
  documents, suggestedDocuments, documentsLoaded, documentsRefreshing, documentsError, storageWarning, busy, documentNameFor, onOpen, onAsk, onBrowse, onRefreshDocuments, onToggleFavorite,
  onIndex, onRetryExtraction,
}: {
  documents: Doc[]
  suggestedDocuments: Doc[]
  documentsLoaded: boolean
  documentsRefreshing: boolean
  documentsError: string
  storageWarning: boolean
  busy: boolean
  documentNameFor: (document: Doc) => string
  onOpen: (doc: Doc) => void
  onAsk: (doc: Doc) => void
  onBrowse: () => void
  onRefreshDocuments: () => void
  onToggleFavorite: (documentId: string) => void
  onIndex: (document: Doc) => void
  onRetryExtraction: (document: Doc) => void
}) {
  const [query, setQuery] = useState('')
  const [fileType, setFileType] = useState<'all' | 'pdf' | 'docx' | 'txt'>('all')
  const [statusFilter, setStatusFilter] = useState<FavoriteStatusFilter>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest')
  const [currentPage, setCurrentPage] = useState(1)
  const [removedFavorite, setRemovedFavorite] = useState<Doc | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const restoreHeadingAfterRefreshRef = useRef(false)
  const filteredDocuments = useMemo(() => {
    const matchesFilename = createTextQueryMatcher(query)
    return documents
    .filter(doc => matchesFilename([doc.filename]))
    .filter(doc => fileType === 'all' || doc.file_type.toLowerCase() === fileType)
    .filter(doc => {
      const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
      return statusFilter === 'all'
        || statusFilter === 'attention' && (lifecycle === 'extract_failed' || lifecycle === 'index_failed')
        || statusFilter === lifecycle
    })
    .slice()
    .sort((left, right) => sortOrder === 'name'
      ? left.filename.localeCompare(right.filename, 'ko')
      : sortOrder === 'oldest'
        ? new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        : new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  },
  [documents, fileType, query, sortOrder, statusFilter])
  const activeFilterLabels = [
    query.trim() ? `이름 “${query.trim().slice(0, 32)}${query.trim().length > 32 ? '…' : ''}”` : '',
    fileType !== 'all' ? fileType.toUpperCase() : '',
    statusFilter === 'all' ? '' : ({
      searchable: '검색 가능',
      processing: '준비 중',
      attention: '확인 필요',
      index_failed: '다시 처리 필요',
      extract_failed: '파일 읽기 실패',
    } as const)[statusFilter],
  ].filter(Boolean)
  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / FAVORITES_PAGE_SIZE))
  const activePage = Math.min(currentPage, pageCount)
  const firstVisibleDocument = filteredDocuments.length ? (activePage - 1) * FAVORITES_PAGE_SIZE + 1 : 0
  const lastVisibleDocument = Math.min(activePage * FAVORITES_PAGE_SIZE, filteredDocuments.length)
  const pagedDocuments = filteredDocuments.slice(firstVisibleDocument - 1, lastVisibleDocument)
  const availableSuggestions = suggestedDocuments.filter(doc => !documents.some(favorite => favorite.id === doc.id))
  const pendingSuggestedFavoriteRef = useRef<string | null>(null)
  const pendingRestoredFavoriteRef = useRef<string | null>(null)

  useEffect(() => {
    setCurrentPage(page => Math.min(page, pageCount))
  }, [pageCount])

  useEffect(() => {
    if (!removedFavorite) return
    const timer = window.setTimeout(() => setRemovedFavorite(null), 8000)
    return () => window.clearTimeout(timer)
  }, [removedFavorite])

  useEffect(() => {
    if (documentsRefreshing) return
    if (documentsError) {
      restoreHeadingAfterRefreshRef.current = false
      return
    }
    if (!restoreHeadingAfterRefreshRef.current) return
    restoreHeadingAfterRefreshRef.current = false
    const target = documents.length === 0 ? emptyHeadingRef.current : headingRef.current
    target?.focus({ preventScroll: true })
  }, [documents.length, documentsError, documentsRefreshing])

  function refreshFavoriteList(event: MouseEvent<HTMLButtonElement>) {
    restoreHeadingAfterRefreshRef.current = event.detail === 0 && Boolean(documentsError)
    onRefreshDocuments()
  }

  useEffect(() => {
    const documentId = pendingSuggestedFavoriteRef.current
    if (!documentId || !documents.some(doc => doc.id === documentId)) return
    const documentIndex = filteredDocuments.findIndex(doc => doc.id === documentId)
    if (documentIndex < 0) return
    const targetPage = Math.floor(documentIndex / FAVORITES_PAGE_SIZE) + 1
    if (activePage !== targetPage) {
      setCurrentPage(targetPage)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`favorite-document-${documentId}`)
      if (!target) return
      pendingSuggestedFavoriteRef.current = null
      target.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [documents, filteredDocuments, activePage])

  useEffect(() => {
    const documentId = pendingRestoredFavoriteRef.current
    if (!documentId || !documents.some(doc => doc.id === documentId)) return
    const documentIndex = filteredDocuments.findIndex(doc => doc.id === documentId)
    if (documentIndex < 0) {
      pendingRestoredFavoriteRef.current = null
      headingRef.current?.focus({ preventScroll: true })
      return
    }
    const targetPage = Math.floor(documentIndex / FAVORITES_PAGE_SIZE) + 1
    if (activePage !== targetPage) {
      setCurrentPage(targetPage)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      const target = window.document.getElementById(`favorite-document-${documentId}`)
      if (!target) return
      pendingRestoredFavoriteRef.current = null
      target.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [documents, filteredDocuments, activePage, removedFavorite])

  function addSuggestedFavorite(documentId: string) {
    pendingSuggestedFavoriteRef.current = documentId
    onToggleFavorite(documentId)
  }

  function removeFavorite(document: Doc) {
    const removedIndex = filteredDocuments.findIndex(doc => doc.id === document.id)
    const nextDocument = filteredDocuments[removedIndex + 1] ?? filteredDocuments[removedIndex - 1]
    setRemovedFavorite(document)
    onToggleFavorite(document.id)
    setAnnouncement(`“${documentNameFor(document)}”을 즐겨찾기에서 해제했습니다.`)
    window.requestAnimationFrame(() => {
      const nextDocumentLink = nextDocument
        ? window.document.getElementById(`favorite-document-${nextDocument.id}`)
        : null
      if (nextDocumentLink?.isConnected) nextDocumentLink.focus()
      else headingRef.current?.focus()
    })
  }

  function undoRemoveFavorite() {
    if (!removedFavorite) return
    const restored = removedFavorite
    pendingRestoredFavoriteRef.current = restored.id
    if (!documents.some(document => document.id === restored.id)) onToggleFavorite(restored.id)
    setRemovedFavorite(null)
    setAnnouncement(`“${documentNameFor(restored)}”을 즐겨찾기에 복원했습니다.`)
  }

  function renderSuggestions() {
    if (availableSuggestions.length === 0) return null
    return <section className="favorites-suggestions" aria-labelledby="favorites-suggestions-title">
      <div className="favorites-suggestions-heading"><div><span className="section-overline">바로 추가</span><h2 id="favorites-suggestions-title">최근 문서</h2></div><span>별표를 누르면 즐겨찾기에 추가됩니다</span></div>
      <div className="favorites-suggestions-grid">{availableSuggestions.slice(0, 3).map(doc => {
        const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
        const statusSummary = lifecycle === 'searchable' ? ' · 검색 가능' : ''
        return <article className="favorites-suggestion" key={doc.id}>
          <span className={`file-icon file-${doc.file_type}`}><FileText size={16}/></span>
          <a className="favorites-suggestion-open" href={documentUrl(doc.id)} onClick={event => {
            if (isPlainLeftClick(event)) {
              event.preventDefault()
              onOpen(doc)
            }
          }} title={`${documentNameFor(doc)} 열기`}>
            <strong title={documentNameFor(doc)}>{doc.filename}</strong><small>{new Date(doc.created_at).toLocaleDateString('ko-KR')} · {getDocumentChunkSummary(doc)}{statusSummary}</small>
          </a>
          <button type="button" disabled={busy} onClick={() => addSuggestedFavorite(doc.id)} aria-label={`${documentNameFor(doc)} 즐겨찾기에 추가`} title="즐겨찾기에 추가"><Star size={16}/></button>
        </article>
      })}</div>
    </section>
  }

  return <section className="secondary-page favorites-page">
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    <div className="secondary-page-heading"><div><span className="page-kicker">자주 쓰는 자료</span><h1 ref={headingRef} tabIndex={-1}>즐겨찾기</h1><p>자주 확인하는 자료를 모아두고 바로 열어보세요.</p></div>{(!documentsLoaded || documents.length > 0 || Boolean(documentsError)) && <button className="button-secondary" type="button" onClick={onBrowse}>문서함 열기 <ArrowRight size={14}/></button>}</div>
    {removedFavorite && <div className="favorites-undo" role="group" aria-label="즐겨찾기 해제 복구">
      <span>“{documentNameFor(removedFavorite)}”을 즐겨찾기에서 해제했습니다.</span>
      <button type="button" onClick={undoRemoveFavorite}><RotateCcw size={13}/> 실행 취소</button>
    </div>}
    <p className={`saved-evidence-privacy ${storageWarning ? 'warning' : ''}`} role={storageWarning ? 'status' : undefined}>
      <Star size={14} fill="currentColor"/>{storageWarning ? '브라우저 저장 공간을 사용할 수 없어 즐겨찾기는 이 페이지를 사용하는 동안만 임시 보관됩니다. 브라우저를 닫으면 사라질 수 있어요.' : '즐겨찾기는 이 브라우저에 저장됩니다.'}
    </p>
    {documents.length > 0 && <div className="favorites-count" role="status" aria-live="polite" aria-atomic="true"><Star size={15} fill="currentColor"/><span>저장한 문서</span><strong>{filteredDocuments.length}</strong><small>{filteredDocuments.length !== documents.length ? `/ ${documents.length}개` : '개'}</small></div>}
    {documentsError && <aside className="setup-note favorites-list-notice">
      <div className="setup-copy" role="alert" aria-live="assertive">
        <strong>{documentsLoaded ? '문서 목록을 새로 불러오지 못했어요.' : '문서 목록을 불러오지 못했어요.'}</strong>
        <span>{documentsError}</span>
      </div>
      <button type="button" disabled={documentsRefreshing} onClick={refreshFavoriteList}><RefreshCw size={14} className={documentsRefreshing ? 'spin' : undefined}/> {documentsRefreshing ? '불러오는 중…' : '다시 시도'}</button>
    </aside>}
    {!documentsLoaded && !documentsError ? <div className="loading-note favorites-list-notice" role="status"><RefreshCw size={14}/> 즐겨찾기를 불러오고 있습니다…</div>
      : documents.length === 0 && !documentsError ? <>
      <div className="activity-empty favorites-empty"><span><Star size={20}/></span><h2 ref={emptyHeadingRef} tabIndex={-1}>즐겨찾기한 문서가 없어요</h2><p>최근 문서에서 별표를 눌러 자주 쓰는 자료를 모아보세요.</p><button className="button-primary" type="button" onClick={onBrowse}>문서함 둘러보기 <ArrowRight size={14}/></button></div>
      {renderSuggestions()}
    </> : documents.length > 0 ? <>
      <div className="favorites-toolbar">
        <label className="favorites-search"><Search size={16} aria-hidden="true"/><input ref={searchInputRef} value={query} onKeyDown={event => { if (shouldClearSearchOnEscape(event.nativeEvent, Boolean(query))) { event.preventDefault(); setCurrentPage(1); setQuery('') } }} onChange={event => { setCurrentPage(1); setQuery(event.target.value) }} placeholder="파일 이름에서 단어 찾기" aria-label="즐겨찾기에서 파일 이름 찾기"/>{query && <button type="button" onClick={() => { setCurrentPage(1); setQuery(''); searchInputRef.current?.focus() }} aria-label="즐겨찾기 검색어 지우기" title="검색어 지우기"><X size={14}/></button>}</label>
        <select value={fileType} onChange={event => { setCurrentPage(1); setFileType(event.target.value as typeof fileType) }} aria-label="즐겨찾기 파일 형식">
          <option value="all">모든 형식</option><option value="pdf">PDF</option><option value="docx">DOCX</option><option value="txt">TXT</option>
        </select>
        <select value={statusFilter} onChange={event => { setCurrentPage(1); setStatusFilter(event.target.value as FavoriteStatusFilter) }} aria-label="즐겨찾기 문서 처리 상태">
          <option value="all">모든 상태</option><option value="searchable">검색 가능</option><option value="processing">준비 중</option><option value="attention">확인 필요</option><option value="index_failed">다시 처리 필요</option><option value="extract_failed">파일 읽기 실패</option>
        </select>
        <select value={sortOrder} onChange={event => { setCurrentPage(1); setSortOrder(event.target.value as typeof sortOrder) }} aria-label="즐겨찾기 정렬">
          <option value="newest">최근 추가순</option><option value="oldest">오래된 순</option><option value="name">이름순</option>
        </select>
        {filteredDocuments.length > 0 && (query.trim() || fileType !== 'all' || statusFilter !== 'all' || sortOrder !== 'newest') && <button className="favorites-reset" type="button" onClick={() => { setCurrentPage(1); setQuery(''); setFileType('all'); setStatusFilter('all'); setSortOrder('newest') }}>초기화</button>}
      </div>
    {filteredDocuments.length === 0 ? <div className="activity-empty favorites-empty no-actions has-filters"><span><Search size={20}/></span><h2 role="status" aria-live="polite">조건에 맞는 문서가 없어요</h2><p>{activeFilterLabels.length > 0 ? `적용한 조건 · ${activeFilterLabels.join(' · ')}` : '검색 조건을 바꿔 다시 찾아보세요.'}</p><button className="button-secondary" type="button" onClick={() => {
      setCurrentPage(1)
      setQuery('')
      setFileType('all')
      setStatusFilter('all')
      setSortOrder('newest')
      window.requestAnimationFrame(() => searchInputRef.current?.focus())
    }}>조건 초기화</button></div> : <div className="favorites-grid">{pagedDocuments.map(doc => {
        const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
        const lifecycleLabel = lifecycle === 'searchable'
          ? '검색 가능'
          : lifecycle === 'processing'
            ? '준비 중'
            : lifecycle === 'extract_failed'
              ? '파일 읽기 실패'
              : '다시 처리 필요'
        return <article className="favorite-card" key={doc.id}>
      <a id={`favorite-document-${doc.id}`} className="favorite-card-main" href={documentUrl(doc.id)} onClick={event => {
        if (isPlainLeftClick(event)) {
          event.preventDefault()
          onOpen(doc)
        }
      }} title={`${documentNameFor(doc)} 열기`}><span className={`file-icon file-${doc.file_type}`}><FileText size={18}/></span><span><strong title={documentNameFor(doc)}>{doc.filename}</strong><small>{new Date(doc.created_at).toLocaleDateString('ko-KR')} · {getDocumentChunkSummary(doc)}</small></span></a>
      <div className="favorite-card-footer"><span className={`favorite-doc-status ${lifecycle === 'extract_failed' || lifecycle === 'index_failed' ? 'attention' : lifecycle === 'processing' ? 'pending' : ''}`}>{lifecycleLabel}</span><div className="favorite-card-actions">
        {lifecycle === 'index_failed' && <button className="favorite-retry" type="button" aria-label={`${documentNameFor(doc)} 검색 준비 다시 처리`} disabled={busy} onClick={event => {
          if (event.detail === 0) event.currentTarget.closest('.favorite-card')?.querySelector<HTMLAnchorElement>('.favorite-card-main')?.focus({ preventScroll: true })
          onIndex(doc)
        }} title="이 문서의 검색 준비를 다시 시작합니다."><RotateCw size={13}/> 다시 처리</button>}
        {lifecycle === 'extract_failed' && <button className="favorite-retry" type="button" aria-label={`${documentNameFor(doc)} 원본 다시 읽기`} disabled={busy} onClick={event => {
          if (event.detail === 0) event.currentTarget.closest('.favorite-card')?.querySelector<HTMLAnchorElement>('.favorite-card-main')?.focus({ preventScroll: true })
          onRetryExtraction(doc)
        }} title="저장된 원본 파일에서 텍스트를 다시 읽습니다."><RefreshCw size={13}/> 다시 읽기</button>}
        <button type="button" onClick={() => onAsk(doc)} disabled={busy || lifecycle !== 'searchable'} aria-label={`${documentNameFor(doc)}에서 질문하기`} title={lifecycle !== 'searchable' ? '검색 준비가 끝난 뒤 질문할 수 있어요.' : `${documentNameFor(doc)}만 검색 범위로 질문하기`}><Search size={14}/> 질문하기</button><button className="favorite-remove" type="button" onClick={() => removeFavorite(doc)} aria-label={`${documentNameFor(doc)} 즐겨찾기 해제`} title="즐겨찾기 해제"><Star size={14} fill="currentColor"/></button></div></div>
      </article>
      })}</div>}
      {filteredDocuments.length > 0 && pageCount > 1 && <nav className="collection-pagination" aria-label="즐겨찾기 페이지 이동">
        <span aria-live="polite" aria-atomic="true">{firstVisibleDocument}–{lastVisibleDocument} / {filteredDocuments.length}개</span>
        <div>
          <button type="button" disabled={activePage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}><ChevronLeft size={14}/> 이전</button>
          <strong aria-current="page">{activePage} / {pageCount}</strong>
          <button type="button" disabled={activePage >= pageCount} onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))}>다음 <ChevronRight size={14}/></button>
        </div>
      </nav>}
      {!query.trim() && fileType === 'all' && statusFilter === 'all' && renderSuggestions()}
    </> : null}
  </section>
}
