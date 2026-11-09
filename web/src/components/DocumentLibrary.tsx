import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  FileUp,
  ListChecks,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type Dispatch, type MouseEvent, type ReactNode, type SetStateAction } from 'react'
import { countSearchableDocumentChunks, getDocumentChunkSummary, getDocumentLifecycle } from '../documentStatus'
import { preferredScrollBehavior } from '../scrollBehavior'
import { createTextQueryMatcher } from '../textQuery.mjs'
import { shouldClearSearchOnEscape } from '../keyboardInput.mjs'
import { documentUrl, isPlainLeftClick } from '../documentLinks.mjs'
import type { Doc } from '../types'

type FileTypeFilter = 'all' | 'pdf' | 'docx' | 'txt'
type DocumentStatusFilter = 'all' | 'extract_failed' | 'index_failed' | 'attention' | 'searchable' | 'processing'
type DocumentSort = 'newest' | 'oldest' | 'name'
type UploadProgress = { current: number; total: number; filename: string; elapsedSeconds: number }
type RecentSearch = { query: string; mode: 'vector' | 'keyword' | 'hybrid'; view: 'results' | 'answer'; documentId: string | null; scopeLabel: string }
const DOCUMENTS_PER_PAGE = 20

type DocumentLibraryProps = {
  documents: Doc[]
  documentNameFor: (document: Doc) => string
  documentsLoaded: boolean
  documentsRefreshing: boolean
  documentsError: string
  focusHeadingAfterDelete: boolean
  onDeleteFocusHandled: () => void
  filteredDocuments: Doc[]
  filenameFilter: string
  favoriteDocumentIds: string[]
  fileTypeFilter: FileTypeFilter
  statusFilter: DocumentStatusFilter
  sortOrder: DocumentSort
  favoritesOnly: boolean
  currentPage: number
  busy: boolean
  uploadProgress: UploadProgress | null
  uploadedDocumentsSearchable: boolean
  duplicateUploads: Array<{ id: string; filename: string }>
  notice: string
  documentContext?: ReactNode
  onFilenameFilterChange: (value: string) => void
  onToggleFavorite: (documentId: string) => void
  onFileTypeFilterChange: (value: FileTypeFilter) => void
  onStatusFilterChange: (value: DocumentStatusFilter) => void
  onFavoritesOnlyChange: Dispatch<SetStateAction<boolean>>
  onCurrentPageChange: Dispatch<SetStateAction<number>>
  onContinueToSearch: () => void
  onAskAboutDocument: (document: Doc) => void
  onSortOrderChange: (value: DocumentSort) => void
  onResetFilters: () => void
  onPickFiles: () => void
  onRefreshDocuments: () => void
  onOpenDocument: (doc: Doc) => void
  onDeleteDocument: (doc: Doc) => void
  onDeleteSelectedDocuments: (documents: Doc[]) => void
  onIndexDocument: (doc: Doc) => void
  onRetryExtraction: (doc: Doc) => void
  onOpenDuplicateDocument: (documentId: string) => void
  onUploadFiles: (files: FileList | null) => void
  onAddDemoDocuments: () => void
  recentSearches: RecentSearch[]
  canRepeatSearch: (search: RecentSearch) => boolean
  onRepeatSearch: (search: RecentSearch) => void
  onViewSearchHistory: () => void
  onClearRecentSearches: () => void
}

function DocumentRow({
  doc,
  isFavorite,
  busy,
  onOpen,
  onDelete,
  onIndex,
  onRetryExtraction,
  onAsk,
  onToggleFavorite,
  documentNameFor,
  selectionMode,
  isSelected,
  onToggleSelection,
}: {
  doc: Doc
  isFavorite: boolean
  busy: boolean
  onOpen: (doc: Doc) => void
  onDelete: (doc: Doc) => void
  onIndex: (doc: Doc) => void
  onRetryExtraction: (doc: Doc) => void
  onAsk: (doc: Doc) => void
  onToggleFavorite: (documentId: string, event: MouseEvent<HTMLButtonElement>) => void
  documentNameFor: (document: Doc) => string
  selectionMode: boolean
  isSelected: boolean
  onToggleSelection: (documentId: string, extendRange: boolean, checked: boolean) => void
}) {
  const documentName = documentNameFor(doc)
  const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
  const indexingFailed = lifecycle === 'index_failed'
  const extracting = lifecycle === 'processing' && doc.status === 'processing'
  const indexed = lifecycle === 'searchable'
  const documentFailed = lifecycle === 'extract_failed'

  function runRecovery(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    const shouldRestoreFocus = event.detail === 0
    const row = event.currentTarget.closest('.document-row')
    const currentDocument = row?.querySelector<HTMLAnchorElement>('.doc-open')
    const nextDocument = row?.nextElementSibling?.querySelector<HTMLAnchorElement>('.doc-open')
    const previousDocument = row?.previousElementSibling?.querySelector<HTMLAnchorElement>('.doc-open')
    const heading = row?.closest('.page-library')?.querySelector<HTMLHeadingElement>('.section-heading h1')
    action()
    if (shouldRestoreFocus) window.requestAnimationFrame(() => {
      const target = row?.isConnected
        ? currentDocument
        : nextDocument?.isConnected
          ? nextDocument
          : previousDocument?.isConnected
            ? previousDocument
            : heading
      target?.focus({ preventScroll: true })
    })
  }

  return (
    <li className={`document-row${selectionMode ? ' selecting' : ''}${indexed ? ' has-quick-ask' : ''}`}>
      {selectionMode && <input
        className="document-select-checkbox"
        type="checkbox"
        checked={isSelected}
        aria-label={`${documentName} 선택`}
        onChange={event => onToggleSelection(
          doc.id,
          event.nativeEvent instanceof window.MouseEvent && event.nativeEvent.shiftKey,
          event.currentTarget.checked,
        )}
      />}
      <div className={`file-icon file-${doc.file_type}`}><FileText size={18} /></div>
      <a
        className="doc-info doc-open"
        id={`library-document-${doc.id}`}
        href={documentUrl(doc.id)}
        onClick={event => {
          if (isPlainLeftClick(event)) {
            event.preventDefault()
            onOpen(doc)
          }
        }}
        title={doc.filename}
      >
        <strong>{doc.filename}</strong>
        <span className="doc-meta">
          {doc.file_type.toUpperCase()} · {getDocumentChunkSummary(doc)}
          <span className="doc-date">{new Date(doc.created_at).toLocaleDateString('ko-KR')}</span>
        </span>
        {doc.error_message && <small title={doc.error_message}>{doc.error_message}</small>}
      </a>
      <div className="doc-actions">
        <span className={`badge ${documentFailed || indexingFailed ? 'failed' : indexed ? 'completed' : 'processing'}`}>
          {documentFailed ? '파일을 읽지 못했어요' : indexingFailed ? '다시 처리 필요' : extracting ? '파일을 읽는 중' : indexed ? '검색 가능' : '준비 중'}
        </span>
        {indexed && <button
          className="doc-quick-ask"
          type="button"
          aria-label={`${documentName}에서 질문하기`}
          title="이 문서만 검색 범위로 설정하고 질문하기"
          disabled={busy}
          onClick={() => onAsk(doc)}
        ><Search size={14} aria-hidden="true" /><span>질문하기</span></button>}
        {indexingFailed && (
          <button className="index-button" aria-label={`${documentName} 검색 준비 다시 처리`} disabled={busy} onClick={event => runRecovery(event, () => onIndex(doc))}>
            <RotateCw size={12} /> 다시 처리
          </button>
        )}
        {documentFailed && (
          <button className="index-button" aria-label={`${documentName} 원본 다시 읽기`} disabled={busy} onClick={event => runRecovery(event, () => onRetryExtraction(doc))} title="저장된 원본 파일에서 텍스트를 다시 읽습니다.">
            <RefreshCw size={12} /> 다시 읽기
          </button>
        )}
      </div>
      <button
        className={`favorite-toggle ${isFavorite ? 'active' : ''}`}
        aria-label={isFavorite ? `${documentName} 즐겨찾기 해제` : `${documentName} 즐겨찾기 추가`}
        aria-pressed={isFavorite}
        title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
        onClick={event => onToggleFavorite(doc.id, event)}
      ><Star size={16} fill={isFavorite ? 'currentColor' : 'none'} /></button>
      <button className="delete-button" aria-label={`${documentName} 삭제`} disabled={busy} onClick={() => onDelete(doc)}>
        <Trash2 size={16} />
      </button>
    </li>
  )
}

export default function DocumentLibrary({
  documents,
  documentNameFor,
  documentsLoaded,
  documentsRefreshing,
  documentsError,
  focusHeadingAfterDelete,
  onDeleteFocusHandled,
  filteredDocuments,
  filenameFilter,
  favoriteDocumentIds,
  fileTypeFilter,
  statusFilter,
  sortOrder,
  favoritesOnly,
  currentPage,
  busy,
  uploadProgress,
  uploadedDocumentsSearchable,
  duplicateUploads,
  notice,
  documentContext,
  onFilenameFilterChange,
  onToggleFavorite,
  onFileTypeFilterChange,
  onStatusFilterChange,
  onFavoritesOnlyChange,
  onCurrentPageChange,
  onContinueToSearch,
  onAskAboutDocument,
  onSortOrderChange,
  onResetFilters,
  onPickFiles,
  onRefreshDocuments,
  onOpenDocument,
  onDeleteDocument,
  onDeleteSelectedDocuments,
  onIndexDocument,
  onRetryExtraction,
  onOpenDuplicateDocument,
  onUploadFiles,
  onAddDemoDocuments,
  recentSearches,
  canRepeatSearch,
  onRepeatSearch,
  onViewSearchHistory,
  onClearRecentSearches,
}: DocumentLibraryProps) {
  const [draggingOver, setDraggingOver] = useState(false)
  const [dropMessage, setDropMessage] = useState('')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [bulkFavoriteMessage, setBulkFavoriteMessage] = useState('')
  const [noticeExpanded, setNoticeExpanded] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const filenameFilterRef = useRef<HTMLInputElement>(null)
  const selectionAnchorRef = useRef<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const emptyStateHeadingRef = useRef<HTMLHeadingElement>(null)
  const documentsCardRef = useRef<HTMLDivElement>(null)
  const previousPageRef = useRef(currentPage)
  const restoreHeadingAfterRefreshRef = useRef(false)
  const favorites = new Set(favoriteDocumentIds)
  const visibleDocuments = filteredDocuments.filter(doc => !favoritesOnly || favorites.has(doc.id))
  const pageCount = Math.max(1, Math.ceil(visibleDocuments.length / DOCUMENTS_PER_PAGE))
  const pageStart = (currentPage - 1) * DOCUMENTS_PER_PAGE
  const displayedDocuments = visibleDocuments.slice(pageStart, pageStart + DOCUMENTS_PER_PAGE)
  const selectedDocuments = displayedDocuments.filter(doc => selectedDocumentIds.includes(doc.id))
  const allPageSelected = displayedDocuments.length > 0 && displayedDocuments.every(doc => selectedDocumentIds.includes(doc.id))
  const favoritableSelectedCount = selectedDocuments.filter(doc => !favorites.has(doc.id)).length
  const favoriteSelectedCount = selectedDocuments.length - favoritableSelectedCount
  const canChangeSelectedFavorites = selectedDocuments.length > 0
  const firstVisibleDocument = visibleDocuments.length ? pageStart + 1 : 0
  const lastVisibleDocument = Math.min(pageStart + DOCUMENTS_PER_PAGE, visibleDocuments.length)
  const allVisible = visibleDocuments.length === documents.length
  const activeFilterLabels = [
    filenameFilter.trim() ? `이름 “${filenameFilter.trim().slice(0, 32)}${filenameFilter.trim().length > 32 ? '…' : ''}”` : '',
    fileTypeFilter !== 'all' ? fileTypeFilter.toUpperCase() : '',
    statusFilter === 'all' ? '' : ({
      searchable: '검색 가능',
      processing: '준비 중',
      attention: '확인 필요',
      index_failed: '다시 처리 필요',
      extract_failed: '파일 읽기 실패',
    } as const)[statusFilter],
    favoritesOnly ? '즐겨찾기' : '',
  ].filter(Boolean)
  const showDocumentContext = Boolean(documentContext) && activeFilterLabels.length === 0 && !selectionMode
  const activeMobileFilterCount = [favoritesOnly, fileTypeFilter !== 'all', statusFilter !== 'all', sortOrder !== 'newest'].filter(Boolean).length
  const matchesFilename = createTextQueryMatcher(filenameFilter)
  const searchableCount = documents.filter(doc => getDocumentLifecycle(doc.status, doc.index_status) === 'searchable').length
  const attentionCount = documents.filter(doc => {
    const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
    return lifecycle === 'extract_failed' || lifecycle === 'index_failed'
  }).length
  const preparingCount = documents.filter(doc => getDocumentLifecycle(doc.status, doc.index_status) === 'processing').length
  const statusFilterBaseDocuments = documents.filter(doc => {
    const matchesName = matchesFilename([doc.filename])
    const matchesFileType = fileTypeFilter === 'all' || doc.file_type.toLowerCase() === fileTypeFilter
    const matchesFavorites = !favoritesOnly || favorites.has(doc.id)
    return matchesName && matchesFileType && matchesFavorites
  })
  const statusOptionCounts = statusFilterBaseDocuments.reduce((counts, doc) => {
    const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
    counts.all += 1
    counts[lifecycle] += 1
    if (lifecycle === 'extract_failed' || lifecycle === 'index_failed') counts.attention += 1
    return counts
  }, { all: 0, searchable: 0, processing: 0, attention: 0, index_failed: 0, extract_failed: 0 })
  const searchableSectionCount = countSearchableDocumentChunks(documents)
  const noticeLines = notice.split('\n').filter(Boolean)
  const compactNotice = noticeLines.length > 3

  useEffect(() => {
    setNoticeExpanded(false)
  }, [notice])

  function scrollToDocuments() {
    window.requestAnimationFrame(() => {
      const card = documentsCardRef.current
      if (!card) return
      card.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: 'start',
      })
      if (!focusHeadingAfterDelete) card.querySelector<HTMLAnchorElement>('.doc-open')?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    onCurrentPageChange(page => Math.min(page, pageCount))
  }, [onCurrentPageChange, pageCount])

  useEffect(() => {
    const documentIds = new Set(documents.map(doc => doc.id))
    setSelectedDocumentIds(current => current.filter(id => documentIds.has(id)))
    if (selectionAnchorRef.current && !documentIds.has(selectionAnchorRef.current)) selectionAnchorRef.current = null
    setBulkFavoriteMessage('')
  }, [documents])

  useEffect(() => {
    selectionAnchorRef.current = null
    setSelectedDocumentIds([])
    setBulkFavoriteMessage('')
  }, [currentPage, filenameFilter, fileTypeFilter, statusFilter, sortOrder, favoritesOnly])

  function toggleDocumentSelection(documentId: string, extendRange: boolean, checked: boolean) {
    setBulkFavoriteMessage('')
    const clickedIndex = displayedDocuments.findIndex(doc => doc.id === documentId)
    const anchorIndex = displayedDocuments.findIndex(doc => doc.id === selectionAnchorRef.current)
    if (extendRange && clickedIndex >= 0 && anchorIndex >= 0) {
      const rangeIds = displayedDocuments
        .slice(Math.min(clickedIndex, anchorIndex), Math.max(clickedIndex, anchorIndex) + 1)
        .map(doc => doc.id)
      setSelectedDocumentIds(current => checked
        ? [...new Set([...current, ...rangeIds])]
        : current.filter(id => !rangeIds.includes(id)))
      return
    }
    selectionAnchorRef.current = documentId
    setSelectedDocumentIds(current => checked
      ? [...new Set([...current, documentId])]
      : current.filter(id => id !== documentId))
  }

  function toggleCurrentPageSelection() {
    setBulkFavoriteMessage('')
    selectionAnchorRef.current = null
    const pageIds = new Set(displayedDocuments.map(doc => doc.id))
    setSelectedDocumentIds(current => allPageSelected
      ? current.filter(id => !pageIds.has(id))
      : [...new Set([...current, ...pageIds])])
  }

  function toggleLibraryFavorite(documentId: string, event?: MouseEvent<HTMLButtonElement>) {
    const removingFromFavorites = favorites.has(documentId)
    const shouldRestoreFocus = favoritesOnly && removingFromFavorites && event?.detail === 0
    const row = event?.currentTarget.closest('.document-row')
    const nextDocument = row?.nextElementSibling?.querySelector<HTMLAnchorElement>('.doc-open')
    const previousDocument = row?.previousElementSibling?.querySelector<HTMLAnchorElement>('.doc-open')
    onToggleFavorite(documentId)
    if (favoritesOnly && removingFromFavorites) {
      setSelectedDocumentIds(current => current.filter(id => id !== documentId))
      if (selectionAnchorRef.current === documentId) selectionAnchorRef.current = null
      setBulkFavoriteMessage('')
    }
    if (shouldRestoreFocus) window.requestAnimationFrame(() => {
      const target = nextDocument?.isConnected ? nextDocument : previousDocument?.isConnected ? previousDocument : headingRef.current
      target?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    if (previousPageRef.current === currentPage) return
    previousPageRef.current = currentPage
    scrollToDocuments()
  }, [currentPage])

  function filterByStatus(status: 'searchable' | 'attention') {
    onCurrentPageChange(1)
    onFavoritesOnlyChange(false)
    onFilenameFilterChange('')
    onFileTypeFilterChange('all')
    onSortOrderChange('newest')
    onStatusFilterChange(statusFilter === status ? 'all' : status)
    if (currentPage === 1) scrollToDocuments()
  }

  useEffect(() => {
    if (focusHeadingAfterDelete) {
      headingRef.current?.focus({ preventScroll: true })
      onDeleteFocusHandled()
    }
  }, [focusHeadingAfterDelete, onDeleteFocusHandled])

  useEffect(() => {
    if (documentsRefreshing) return
    if (documentsError) {
      restoreHeadingAfterRefreshRef.current = false
      return
    }
    if (!restoreHeadingAfterRefreshRef.current) return
    restoreHeadingAfterRefreshRef.current = false
    const target = documents.length === 0 ? emptyStateHeadingRef.current : headingRef.current
    target?.focus({ preventScroll: true })
  }, [documentsError, documentsRefreshing])

  function refreshDocumentList(event: MouseEvent<HTMLButtonElement>) {
    restoreHeadingAfterRefreshRef.current = event.detail === 0 && Boolean(documentsError)
    onRefreshDocuments()
  }

  return (
    <section className="library-section page-library" id="library">
      <div className="section-heading">
        <div>
          <span className="section-overline">자료실</span>
          <h1 ref={headingRef} tabIndex={-1}>내 문서 <span className="count">{documents.length}</span></h1>
          <p>올린 파일을 확인하고 내용을 열어보세요.</p>
        </div>
        {(documents.length > 0 || !documentsLoaded || Boolean(documentsError)) && <div className="library-actions">
          {documents.length > 0 && <button
            className={`button-secondary selection-mode-toggle${selectionMode ? ' active' : ''}`}
            type="button"
            aria-pressed={selectionMode}
            disabled={busy}
            onClick={event => {
              const shouldFocusFirstCheckbox = event.detail === 0 && !selectionMode
              setSelectionMode(value => !value)
              selectionAnchorRef.current = null
              setSelectedDocumentIds([])
              setBulkFavoriteMessage('')
              if (shouldFocusFirstCheckbox) window.requestAnimationFrame(() => {
                documentsCardRef.current?.querySelector<HTMLInputElement>('.document-select-checkbox')?.focus()
              })
            }}
          ><ListChecks size={14} /> {selectionMode ? '선택 마치기' : '여러 문서 선택'}</button>}
          {documents.length > 0 && <button className="button-secondary refresh-documents" disabled={busy || documentsRefreshing} onClick={refreshDocumentList}>
            <RefreshCw size={14} className={documentsRefreshing ? 'spin' : undefined} /> {documentsRefreshing ? '불러오는 중…' : '새로고침'}
          </button>}
          <button className="button-primary add-button" disabled={busy} onClick={onPickFiles}>
            <Plus size={17} /> 문서 추가
          </button>
        </div>}
      </div>

      {uploadProgress && (
        <div className="upload-progress" role="status" aria-live="polite">
          <span className="upload-progress-mark"><RefreshCw size={15} /></span>
          <div className="upload-progress-copy">
            <strong>{uploadProgress.total > 1 ? `파일 ${uploadProgress.current} / ${uploadProgress.total} 처리 중` : '파일 처리 중'} <span aria-hidden="true">· {Math.floor(uploadProgress.elapsedSeconds / 60)}:{String(uploadProgress.elapsedSeconds % 60).padStart(2, '0')}</span></strong>
            <span title={uploadProgress.filename}>{uploadProgress.filename}</span>
          </div>
          <progress aria-label={`${uploadProgress.filename} 처리 중`} />
        </div>
      )}

      {notice && (
        <div className="notice">
          <span className="notice-message" role="status" aria-live="polite">{compactNotice && !noticeExpanded ? `${noticeLines.slice(0, 2).join('\n')}\n외 ${noticeLines.length - 2}건의 결과` : notice}</span>
          {compactNotice && <button className="notice-expand" type="button" aria-expanded={noticeExpanded} onClick={() => setNoticeExpanded(value => !value)}>{noticeExpanded ? '결과 접기' : '결과 전체 보기'}</button>}
          {(duplicateUploads.length > 0 || uploadedDocumentsSearchable) && <div className="notice-actions">
            {duplicateUploads.slice(0, 3).map(duplicate => <button key={duplicate.id} className="notice-action notice-action-duplicate" title={`${duplicate.filename} 열기`} onClick={() => onOpenDuplicateDocument(duplicate.id)}>
              <FileText size={13} /> 기존 문서 열기 · {duplicate.filename} <ArrowUpRight size={12} />
            </button>)}
            {duplicateUploads.length > 3 && <details className="notice-duplicate-more">
              <summary>기존 문서 {duplicateUploads.length - 3}개 더 보기</summary>
              <div>{duplicateUploads.slice(3).map(duplicate => <button key={duplicate.id} className="notice-action notice-action-duplicate" title={`${duplicate.filename} 열기`} onClick={() => onOpenDuplicateDocument(duplicate.id)}>
                <FileText size={13} /> {duplicate.filename} <ArrowUpRight size={12} />
              </button>)}</div>
            </details>}
            {uploadedDocumentsSearchable && <button className="notice-action" onClick={onContinueToSearch}><Search size={13} /> 문서 검색하기</button>}
          </div>}
        </div>
      )}

      {documents.length > 0 && <section className={`library-overview ${attentionCount > 0 ? 'needs-attention' : ''}`} aria-label="문서 준비 상태">
        <span className={`library-overview-icon ${preparingCount > 0 && attentionCount === 0 ? 'pending' : ''}`} aria-hidden="true">{attentionCount > 0 ? <AlertCircle size={17} /> : preparingCount > 0 ? <RefreshCw size={16} /> : <Check size={17} />}</span>
        <div className="library-overview-copy" aria-live="polite">
          <strong>{attentionCount > 0
            ? `확인이 필요한 문서가 ${attentionCount}개 있어요`
            : preparingCount > 0 && searchableCount === 0
              ? '문서를 검색할 수 있게 준비하고 있어요'
              : `${searchableCount}개 문서를 바로 검색할 수 있어요`}</strong>
          <span>{documents.length}개 문서 · 검색 가능 구간 {searchableSectionCount}개{preparingCount > 0 ? ` · ${preparingCount}개 준비 중` : ''}</span>
        </div>
        {attentionCount > 0 && <button className="library-overview-filter" type="button" aria-label={statusFilter === 'attention' ? '전체 문서 보기' : `확인이 필요한 문서 ${attentionCount}개만 보기`} aria-pressed={statusFilter === 'attention'} onClick={() => filterByStatus('attention')}>
          {statusFilter === 'attention' ? '전체 문서 보기' : '확인할 문서 보기'} <ArrowUpRight size={13} />
        </button>}
        {attentionCount === 0 && searchableCount > 0 && <button className="library-overview-filter" type="button" onClick={onContinueToSearch}>
          문서 검색하기 <Search size={13} />
        </button>}
      </section>}

      {documents.length > 0 && <div className="document-toolbar">
        <div className="document-filter">
          <label className="document-filter-label" htmlFor="document-filename-filter">
            <Search size={17} aria-hidden="true" />
          </label>
          <input
            ref={filenameFilterRef}
            id="document-filename-filter"
            value={filenameFilter}
            onKeyDown={event => {
              if (!shouldClearSearchOnEscape(event.nativeEvent, Boolean(filenameFilter))) return
              event.preventDefault()
              onCurrentPageChange(1)
              onFilenameFilterChange('')
            }}
            onChange={event => { onCurrentPageChange(1); onFilenameFilterChange(event.target.value) }}
            placeholder="파일 이름에서 단어 찾기"
            aria-label="파일 이름으로 찾기"
          />
          {filenameFilter && <button
            className="document-filter-clear"
            type="button"
            aria-label="파일 이름 검색어 지우기"
            title="파일 이름 검색어 지우기"
            onClick={() => {
              onCurrentPageChange(1)
              onFilenameFilterChange('')
              window.requestAnimationFrame(() => filenameFilterRef.current?.focus())
            }}
          ><X size={14} aria-hidden="true" /></button>}
        </div>
        <button
          className="mobile-document-filter-toggle"
          type="button"
          aria-expanded={mobileFiltersOpen}
          aria-controls="document-library-filter-options"
          aria-label={activeMobileFilterCount ? `문서 필터 및 정렬 · ${activeMobileFilterCount}개 적용` : '문서 필터 및 정렬'}
          onClick={() => setMobileFiltersOpen(open => !open)}
        >
          <SlidersHorizontal size={15} aria-hidden="true" /> 필터
          {activeMobileFilterCount > 0 && <span aria-hidden="true">{activeMobileFilterCount}</span>}
        </button>
        <div id="document-library-filter-options" className={`document-tools${mobileFiltersOpen ? ' mobile-open' : ''}`}>
          <button
            className={`favorite-filter ${favoritesOnly ? 'active' : ''}`}
            type="button"
            aria-pressed={favoritesOnly}
            onClick={() => { onCurrentPageChange(1); onFavoritesOnlyChange(value => !value) }}
          ><Star size={14} fill={favoritesOnly ? 'currentColor' : 'none'} /> 즐겨찾기</button>
          <select
            value={fileTypeFilter}
            onChange={event => { onCurrentPageChange(1); onFileTypeFilterChange(event.target.value as FileTypeFilter) }}
            aria-label="파일 형식 필터"
          >
            <option value="all">모든 형식</option>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="txt">TXT</option>
          </select>
          <select
            value={sortOrder}
            onChange={event => { onCurrentPageChange(1); onSortOrderChange(event.target.value as DocumentSort) }}
            aria-label="문서 정렬"
          >
            <option value="newest">최근 추가순</option>
            <option value="oldest">오래된 순</option>
            <option value="name">이름순</option>
          </select>
          <select
            value={statusFilter}
            onChange={event => { onCurrentPageChange(1); onStatusFilterChange(event.target.value as DocumentStatusFilter) }}
            aria-label="문서 처리 상태 필터"
          >
            <option value="all">모든 상태 · {statusOptionCounts.all}</option>
            <option value="searchable">검색 가능 · {statusOptionCounts.searchable}</option>
            <option value="processing">준비 중 · {statusOptionCounts.processing}</option>
            <option value="attention">확인 필요 · {statusOptionCounts.attention}</option>
            <option value="index_failed">다시 처리 필요 · {statusOptionCounts.index_failed}</option>
            <option value="extract_failed">파일 읽기 실패 · {statusOptionCounts.extract_failed}</option>
          </select>
          {(filenameFilter.trim() || fileTypeFilter !== 'all' || statusFilter !== 'all' || sortOrder !== 'newest' || favoritesOnly) && (
            <button className="clear-filter" type="button" onClick={() => {
              onResetFilters()
              setMobileFiltersOpen(false)
              window.requestAnimationFrame(() => filenameFilterRef.current?.focus())
            }}>초기화</button>
          )}
        </div>
        <span className={`document-toolbar-count${activeFilterLabels.length > 0 || visibleDocuments.length > DOCUMENTS_PER_PAGE ? ' has-details' : ''}`} aria-live="polite" aria-atomic="true">
          {allVisible ? `${documents.length}개 문서` : `${visibleDocuments.length} / ${documents.length}개`}
          {visibleDocuments.length > DOCUMENTS_PER_PAGE && ` · ${firstVisibleDocument}–${lastVisibleDocument} 표시`}
        </span>
      </div>}

      {documentsError && documents.length > 0 && (
        <div className="library-stale-note">
          <span role="alert" aria-live="assertive">문서 목록을 새로 확인하지 못했습니다. 현재 화면에는 이전에 불러온 목록을 표시하고 있습니다.</span>
          <button type="button" disabled={documentsRefreshing} onClick={refreshDocumentList}>{documentsRefreshing ? '불러오는 중…' : '다시 시도'}</button>
        </div>
      )}

      {selectionMode && visibleDocuments.length > 0 && <div className="document-selection-toolbar">
        <label>
          <input
            type="checkbox"
            aria-label="현재 페이지 문서 전체 선택"
            checked={allPageSelected}
            ref={element => {
              if (element) element.indeterminate = selectedDocuments.length > 0 && !allPageSelected
            }}
            onChange={toggleCurrentPageSelection}
          />
          <span>현재 페이지 {displayedDocuments.length}개 선택</span>
          <small className="selection-help-desktop">Shift+클릭으로 연속 선택</small>
          <small className="selection-help-mobile">체크박스로 문서 선택</small>
        </label>
        <div>
          <span role="status" aria-live="polite">{selectedDocuments.length}개 선택</span>
          <button type="button" className="document-selection-favorite" disabled={busy || !canChangeSelectedFavorites} onClick={event => {
            if (favoritableSelectedCount > 0) {
              selectedDocuments.filter(doc => !favorites.has(doc.id)).forEach(doc => toggleLibraryFavorite(doc.id))
              setBulkFavoriteMessage(`즐겨찾기에 ${favoritableSelectedCount}개 추가했어요.`)
              return
            }
            const shouldFocusEmptyState = favoritesOnly && selectedDocuments.length > 0 && event.detail === 0
            selectedDocuments.filter(doc => favorites.has(doc.id)).forEach(doc => toggleLibraryFavorite(doc.id))
            setBulkFavoriteMessage(`즐겨찾기에서 ${favoriteSelectedCount}개 해제했어요.`)
            if (shouldFocusEmptyState) window.requestAnimationFrame(() => {
              documentsCardRef.current?.querySelector<HTMLButtonElement>('.filter-empty-reset')?.focus({ preventScroll: true })
            })
          }}><Star size={13} fill={favoriteSelectedCount === selectedDocuments.length && selectedDocuments.length > 0 ? 'currentColor' : 'none'} /> {favoritableSelectedCount > 0 ? '즐겨찾기 추가' : '즐겨찾기 해제'}</button>
          <button type="button" className="document-selection-clear" disabled={selectedDocuments.length === 0} onClick={() => { selectionAnchorRef.current = null; setSelectedDocumentIds([]); setBulkFavoriteMessage('') }}>선택 해제</button>
          <button type="button" className="document-selection-delete" disabled={busy || selectedDocuments.length === 0} onClick={() => onDeleteSelectedDocuments(selectedDocuments)}>
            <Trash2 size={14} /> 선택 삭제
          </button>
        </div>
        {bulkFavoriteMessage && <span className="document-selection-feedback" role="status" aria-live="polite">{bulkFavoriteMessage}</span>}
      </div>}

      <div className={`library-reading-layout${showDocumentContext ? ' has-document-context' : ''}`}>
      <div className="library-list-column">
      <div
        ref={documentsCardRef}
        className={`documents-card full-documents-card ${documentsLoaded && documents.length === 0 ? 'empty-document-card' : ''} ${draggingOver ? 'drag-over' : ''}`}
        onDragEnter={event => {
          event.preventDefault()
          if (Array.from(event.dataTransfer.types).includes('Files')) {
            if (!busy) setDropMessage('')
            setDraggingOver(true)
          }
        }}
        onDragLeave={event => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDraggingOver(false)
        }}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault()
          setDraggingOver(false)
          if (busy) {
            setDropMessage(uploadProgress
              ? '파일 처리 중에는 새 파일을 받을 수 없어요. 현재 작업이 끝난 뒤 다시 추가해 주세요.'
              : '문서 작업 중에는 새 파일을 받을 수 없어요. 작업이 끝난 뒤 다시 추가해 주세요.')
            return
          }
          setDropMessage('')
          onUploadFiles(event.dataTransfer.files)
        }}
      >
        {draggingOver && <div className="drop-overlay" role="status"><FileUp size={21} /><strong>{busy ? '지금 문서를 처리하고 있어요.' : '여기에 놓으면 문서를 추가합니다.'}</strong><span>{busy ? '작업이 끝난 뒤 다시 추가해 주세요.' : 'PDF · DOCX · TXT'}</span></div>}
        {dropMessage && <p className="library-drop-message" role="status">{dropMessage}</p>}
        {!documentsLoaded ? (
          <div className="document-list-loading" role="status" aria-label="문서 목록을 불러오고 있습니다">
            <span>문서 목록을 불러오고 있습니다…</span>
            <ul aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => <li className="document-skeleton-row" key={index}>
                <i className="document-skeleton-icon" />
                <span className="document-skeleton-copy"><i /><i /></span>
                <i className="document-skeleton-status" />
                <i className="document-skeleton-action" />
              </li>)}
            </ul>
          </div>
        ) : documentsError && documents.length === 0 ? (
          <div className="library-load-error">
            <div role="alert" aria-live="assertive">
              <strong>문서 목록을 불러오지 못했어요.</strong>
              <span>{documentsError}</span>
            </div>
            <button className="button-secondary" disabled={documentsRefreshing} onClick={refreshDocumentList}><RefreshCw size={14} className={documentsRefreshing ? 'spin' : undefined} /> {documentsRefreshing ? '불러오는 중…' : '다시 불러오기'}</button>
          </div>
        ) : documents.length === 0 ? (
          <div className="empty full-empty">
            <span className="empty-illustration" aria-hidden="true">
              <svg viewBox="0 0 56 56" focusable="false">
                <circle cx="28" cy="28" r="25" fill="#f1f4ed" />
                <path d="M8 20h17l3 3h19v21H8z" fill="#e5ebdf" stroke="#b8c5b4" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M14 12h18l7 7v23H14z" fill="#fffdfa" stroke="#9eac9d" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M32 12v7h7M19 25h15M19 29h12M19 33h9" fill="none" stroke="#8c9b8b" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="39" cy="37" r="6.2" fill="#f8eee2" stroke="#9a775f" strokeWidth="1.4" />
                <path d="m43.5 41.5 4.1 4.1" fill="none" stroke="#9a775f" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h2 ref={emptyStateHeadingRef} tabIndex={-1}>아직 문서가 없습니다</h2>
              <span>PDF, DOCX, TXT 파일을 추가하면 이곳에 모입니다.</span>
              <small className="drop-hint">파일을 이 영역으로 끌어 놓아도 됩니다 · 파일당 20MB</small>
              <button className="button-primary empty-add-button" disabled={busy} onClick={onPickFiles}>
                문서 파일 선택 <ArrowUpRight size={13} />
              </button>
              <button className="plain-link" disabled={busy} onClick={onAddDemoDocuments}>
                가상 예시 문서 3개 추가 <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : visibleDocuments.length === 0 ? (
          <div className={`filter-empty ${activeFilterLabels.length > 0 ? 'has-active-filters' : ''}`}>
            <div className="filter-empty-copy">
              <strong>{favoritesOnly && !filenameFilter.trim() && fileTypeFilter === 'all' && statusFilter === 'all' ? '즐겨찾기한 문서가 없어요.' : '조건에 맞는 문서가 없어요.'}</strong>
              {activeFilterLabels.length > 0 && <span>{activeFilterLabels.join(' · ')}</span>}
              {bulkFavoriteMessage && <span className="filter-empty-feedback" role="status" aria-live="polite">{bulkFavoriteMessage}</span>}
            </div>
            {activeFilterLabels.length > 0 && <button className="button-secondary filter-empty-reset" type="button" onClick={() => {
              onCurrentPageChange(1)
              onFavoritesOnlyChange(false)
              onResetFilters()
              window.requestAnimationFrame(() => filenameFilterRef.current?.focus())
            }}>{favoritesOnly && !filenameFilter.trim() && fileTypeFilter === 'all' && statusFilter === 'all' ? '전체 문서 보기' : '검색 조건 초기화'}</button>}
          </div>
        ) : (
          <ul className="document-list">
            {displayedDocuments.map(doc => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                documentNameFor={documentNameFor}
                isFavorite={favorites.has(doc.id)}
                busy={busy}
                selectionMode={selectionMode}
                isSelected={selectedDocumentIds.includes(doc.id)}
                onToggleSelection={toggleDocumentSelection}
                onOpen={onOpenDocument}
                onDelete={onDeleteDocument}
                onIndex={onIndexDocument}
                onRetryExtraction={onRetryExtraction}
                onAsk={onAskAboutDocument}
                onToggleFavorite={toggleLibraryFavorite}
              />
            ))}
          </ul>
        )}
        {documents.length > 0 && <div className="document-drop-hint" aria-label="파일을 끌어 놓아 추가할 수 있습니다">
          <span><FileUp size={15} aria-hidden="true"/></span>
          <strong>이 영역에 파일을 끌어 놓아 추가</strong>
          <small>PDF · DOCX · TXT · 파일당 20MB 이하</small>
        </div>}
      </div>

      {pageCount > 1 && <nav className="document-pagination" aria-label="문서 목록 페이지">
        <button className="button-secondary" disabled={currentPage <= 1} onClick={() => onCurrentPageChange(page => Math.max(1, page - 1))}>이전</button>
        <span aria-live="polite">{currentPage} / {pageCount}페이지 · {firstVisibleDocument}–{lastVisibleDocument}개</span>
        <button className="button-secondary" disabled={currentPage >= pageCount} onClick={() => onCurrentPageChange(page => Math.min(pageCount, page + 1))}>다음</button>
      </nav>}

      <p className="privacy">
        <ShieldCheck size={14} />
        <span>문서 원문은 외부 AI 서비스로 보내지 않으며, 내 계정의 보관함에서만 확인할 수 있습니다.</span>
      </p>

      {documents.length > 0 && recentSearches.length > 0 && activeFilterLabels.length === 0 && !selectionMode && <section className="library-recent-searches" aria-labelledby="library-recent-searches-title">
        <div className="library-recent-searches-heading">
          <div><span className="section-overline">이어서 찾기</span><h2 id="library-recent-searches-title">최근 검색</h2></div>
          <div className="library-recent-searches-actions">
            <button type="button" className="library-search-history-open" aria-label="검색 기록 전체 보기" onClick={onViewSearchHistory}>모두 보기 <ArrowUpRight size={12} aria-hidden="true" /></button>
            <button type="button" aria-label="최근 검색 기록 모두 지우기" onClick={() => {
              onClearRecentSearches()
              window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))
            }}>기록 지우기</button>
          </div>
        </div>
        <div className="library-recent-searches-list">
          {recentSearches.slice(0, 3).map(item => <button
            key={`${item.documentId ?? 'all'}:${item.mode}:${item.query}`}
            type="button"
            disabled={busy || !canRepeatSearch(item)}
            title={!canRepeatSearch(item) ? '문서 검색을 사용할 수 있을 때 다시 실행할 수 있어요.' : item.query}
            onClick={() => onRepeatSearch(item)}
          >
            <span>{item.query}</span>
            <small>{item.view === 'answer' ? '답변' : item.mode === 'vector' ? '비슷한 내용' : item.mode === 'keyword' ? '정확한 단어' : '함께 찾기'} · {item.scopeLabel}</small>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>)}
        </div>
      </section>}
      </div>
      {showDocumentContext && <div className="library-context-column">{documentContext}</div>}
      </div>
    </section>
  )
}
