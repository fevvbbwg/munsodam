import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, FileText, FileUp, RefreshCw, Search, BookOpen, ArrowUpRight, ArrowDownLeft, ChevronRight, Plus, Star, X, UserRound, History as HistoryIcon, Bookmark, MoreHorizontal, Info, ShieldCheck, RotateCcw } from 'lucide-react'
import { countSearchableDocumentChunks, getDocumentChunkSummary, getDocumentLifecycle } from './documentStatus'
import DocumentLibrary from './components/DocumentLibrary'
import DocumentDetail from './components/DocumentDetail'
import WorkspaceDocumentContext, { SelectedDocumentContext, WorkspaceDocumentTopics } from './components/WorkspaceDocumentContext'
import ProjectOverview from './components/ProjectOverview'
import SearchResults from './components/SearchResults'
import { cleanAnswerText } from './cleanAnswerText'
import DeleteConfirmDialog from './components/DeleteConfirmDialog'
import UserGuide from './components/UserGuide'
import { preferredScrollBehavior } from './scrollBehavior'
import type { ChatResult, Doc, DocDetail, DocOutline, SavedEvidence, SearchResult } from './types'
import { useAuth } from './auth'
import ActivityPage, { type ActivityFilters } from './components/ActivityPage'
import AccountPage from './components/AccountPage'
import FavoritesPage from './components/FavoritesPage'
import SavedEvidencePage, { type SavedEvidenceView } from './components/SavedEvidencePage'
import RecentSavedEvidence from './components/RecentSavedEvidence'
import { loadRecentSearches as loadStoredRecentSearches, mergeRestoredRecentSearches, saveRecentSearches } from './recentSearchStorage.mjs'
import { loadSavedEvidence, savedEvidenceKey } from './savedEvidenceStorage.mjs'
import { mergeDocumentFocusQuery, mergeSearchHistoryEntry, readDocumentFocusQuery, readSearchHistoryEntry, resolveSearchHistoryRestore, sameSearchHistoryEntry } from './searchHistoryState.mjs'
import type { SearchHistoryEntry, SearchHistoryView } from './searchHistoryState.mjs'
import { selectWorkspaceContextDocuments } from './workspaceContextDocuments.mjs'
import { selectRecentHomeDocuments, selectRelatedDocuments, selectWorkspaceRecentDocuments } from './relatedDocuments.mjs'
import { createDocumentDisplayNames } from './documentDisplayName.mjs'
import { savedSourceAvailability as resolveSavedSourceAvailability } from './documentAvailability.mjs'
import { isImeCompositionEvent, shouldClearSearchOnEscape } from './keyboardInput.mjs'
import { createTextQueryMatcher } from './textQuery.mjs'
import { documentUrl, isPlainLeftClick } from './documentLinks.mjs'

type AppPage = 'search' | 'documents' | 'detail' | 'about' | 'guide' | 'activity' | 'account' | 'favorites' | 'saved'

function pageForPath(path: string): AppPage {
  if (path.startsWith('/documents/')) return 'detail'
  if (path === '/documents') return 'documents'
  if (path === '/about') return 'about'
  if (path === '/guide') return 'guide'
  if (path === '/activity') return 'activity'
  if (path === '/account') return 'account'
  if (path === '/favorites') return 'favorites'
  if (path === '/saved') return 'saved'
  return 'search'
}

const API = import.meta.env.VITE_API_URL ?? ''
type Ready = { database: { available: boolean; pgvector: boolean; backend?: string; error?: string }; ollama: { available: boolean; version: string | null; error: string | null }; models: { chat: { name: string; installed: boolean; functional: boolean }; embedding: { name: string; installed: boolean; functional: boolean; dimensions: number | null } }; retrieval?: { max_cosine_distance?: number } }
type UploadProgress = { current: number; total: number; filename: string; elapsedSeconds: number }
type SearchMode = 'vector' | 'keyword' | 'hybrid'
type RecentSearch = { query: string; mode: SearchMode; view: SearchHistoryView; documentId: string | null; createdAt?: number }
type QuestionStarter = { label: string; question: string; directAnswer: boolean; document?: Doc }
const FAVORITE_DOCUMENTS_KEY = (userId: string) => `munsodam.${userId}.favorite-documents.v1`
const RECENT_DOCUMENTS_KEY = (userId: string) => `munsodam.${userId}.recent-documents.v1`
const RECENT_SEARCHES_KEY = (userId: string) => `munsodam.${userId}.recent-searches.v1`
const DETAIL_CHUNK_PAGE_SIZE = 40
const DOCUMENT_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000
const DOCUMENT_UPLOAD_TIMEOUT_MESSAGE = '문서 처리 응답이 10분 동안 오지 않았어요. 문서함을 새로고침해 등록 여부를 확인한 뒤 다시 시도해 주세요.'
const EXAMPLE_CORPUS_FILES = ['HR-01.txt', 'EXP-01.txt', 'IT-01.txt']
const EXAMPLE_QUESTIONS = [
  { label: '한 문서', filenames: ['EXP-01.txt'], question: '출장 정산은 언제까지야?', directAnswer: true },
  { label: '두 문서', filenames: ['IT-01.txt', 'EXP-01.txt'], question: '노트북 분실 때 신고와 출장 택시비 증빙은?', directAnswer: true },
  { label: '답변 보류 예시', filenames: ['HR-01.txt', 'EXP-01.txt', 'IT-01.txt'], question: '회사 급여일은 며칠이야?', directAnswer: true },
]
const GENERAL_QUESTION_STARTERS = [
  { label: '핵심 내용', question: '올린 자료에서 가장 중요한 내용을 알려줘.', directAnswer: false },
  { label: '절차', question: '신청이나 처리 절차를 단계별로 알려줘.', directAnswer: false },
  { label: '기한과 조건', question: '자료에 적힌 기한과 조건을 알려줘.', directAnswer: false },
]
const SINGLE_DOCUMENT_QUESTION_STARTERS = [
  { label: '핵심 내용', question: '이 문서에서 가장 중요한 내용을 알려줘.', directAnswer: false },
  { label: '절차', question: '이 문서의 신청이나 처리 절차를 알려줘.', directAnswer: false },
  { label: '기한과 조건', question: '이 문서에 적힌 기한과 조건을 알려줘.', directAnswer: false },
]

function normalizeQuestionForComparison(question: string) {
  return question.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function normalizeRecentSearchKey(query: string) {
  return query.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

function addRecentSearch(current: RecentSearch[], query: string, mode: SearchMode, view: SearchHistoryView = 'results', documentId: string | null = null): RecentSearch[] {
  const key = `${normalizeRecentSearchKey(query)}:${documentId ?? ''}`
  return [{ query, mode, view, documentId, createdAt: Date.now() }, ...current.filter(item => `${normalizeRecentSearchKey(item.query)}:${item.documentId ?? ''}` !== key)].slice(0, 20)
}

function loadRecentSearches(userId: string): RecentSearch[] {
  return loadStoredRecentSearches(userId)
}

function loadFavoriteDocumentIds(userId: string): string[] {
  try {
    const stored = localStorage.getItem(FAVORITE_DOCUMENTS_KEY(userId))
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 200))].slice(0, 500)
  } catch {
    return []
  }
}

function loadRecentDocumentIds(userId: string): string[] {
  try {
    const stored = localStorage.getItem(RECENT_DOCUMENTS_KEY(userId))
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 200))].slice(0, 20)
  } catch {
    return []
  }
}

async function readApiResponse(response: Response): Promise<any> {
  const body = await response.text()
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    const detail = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
    return { detail: detail || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
}

async function fetchInteractiveRequest(
  url: string,
  init: RequestInit,
  timeoutMs = 120_000,
  timeoutMessage = '요청이 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요.',
): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage)
    if (error instanceof TypeError) throw new Error('문서 기능을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

function uploadIssue(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['pdf', 'docx', 'txt'].includes(extension ?? '')) {
    return `건너뜀 · ${file.name}: PDF, DOCX, TXT 파일만 추가할 수 있습니다.`
  }
  if (file.size === 0) {
    return `건너뜀 · ${file.name}: 내용이 없는 파일은 추가할 수 없습니다.`
  }
  if (file.size > 20 * 1024 * 1024) {
    return `건너뜀 · ${file.name}: 파일당 20MB까지 추가할 수 있습니다.`
  }
  return null
}

function apiMessage(payload: any, fallback: string): string {
  const detail = payload?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map(item => typeof item === 'string' ? item : typeof item?.msg === 'string' ? item.msg : '')
      .filter(Boolean)
    if (messages.length) return messages.join(' · ')
  }
  if (typeof detail?.message === 'string' && detail.message.trim()) return detail.message
  return fallback
}

function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return '문서 기능을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function App() {
  const { user, logout } = useAuth()
  const searchShortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
  const [documents, setDocuments] = useState<Doc[]>([])
  const documentDisplayNames = useMemo(() => createDocumentDisplayNames(documents), [documents])
  const [workspaceOutlines, setWorkspaceOutlines] = useState<Record<string, DocOutline>>({})
  const [documentsLoaded, setDocumentsLoaded] = useState(false)
  const [documentsRefreshing, setDocumentsRefreshing] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const restoreSearchHeadingAfterRefreshRef = useRef(false)
  const [favoriteDocumentIds, setFavoriteDocumentIds] = useState<string[]>(() => loadFavoriteDocumentIds(user.id))
  const [favoriteStorageWarning, setFavoriteStorageWarning] = useState(false)
  const [recentDocumentIds, setRecentDocumentIds] = useState<string[]>(() => loadRecentDocumentIds(user.id))
  const [page, setPage] = useState<AppPage>(() => pageForPath(location.pathname))
  const [selectedDocument, setSelectedDocument] = useState<Doc | null>(null)
  const [documentDetail, setDocumentDetail] = useState<DocDetail | null>(null)
  const [documentOutlineRevision, setDocumentOutlineRevision] = useState(0)
  const [selectedExcerpt, setSelectedExcerpt] = useState<string | null>(null)
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number | null>(null)
  const [selectedSearchQuery, setSelectedSearchQuery] = useState<string | null>(null)
  const [detailPreviewUnavailable, setDetailPreviewUnavailable] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [documentFilter, setDocumentFilter] = useState('')
  const [documentLibraryPage, setDocumentLibraryPage] = useState(1)
  const [documentFavoritesOnly, setDocumentFavoritesOnly] = useState(false)
  const [workspacePane, setWorkspacePane] = useState<'search' | 'documents'>('search')
  const [searchTopicsOpen, setSearchTopicsOpen] = useState(false)
  const [searchTopicsTouched, setSearchTopicsTouched] = useState(false)
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'pdf' | 'docx' | 'txt'>('all')
  const [documentStatusFilter, setDocumentStatusFilter] = useState<'all' | 'extract_failed' | 'index_failed' | 'attention' | 'searchable' | 'processing'>('all')
  const [documentSort, setDocumentSort] = useState<'newest' | 'oldest' | 'name'>('newest')
  const [ready, setReady] = useState<Ready | null>(null)
  const [originalDownloadAvailable, setOriginalDownloadAvailable] = useState(false)
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [draggingOverHomeUpload, setDraggingOverHomeUpload] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  useEffect(() => {
    if (!uploadProgress) return
    const timer = window.setInterval(() => {
      setUploadProgress(current => current ? { ...current, elapsedSeconds: current.elapsedSeconds + 1 } : null)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [Boolean(uploadProgress)])
  const [uploadedDocumentsSearchable, setUploadedDocumentsSearchable] = useState(false)
  const [duplicateUploads, setDuplicateUploads] = useState<Array<{ id: string; filename: string }>>([])
  const [notice, setNotice] = useState('')
  const [documentsToDelete, setDocumentsToDelete] = useState<Doc[] | null>(null)
  const [focusDocumentHeading, setFocusDocumentHeading] = useState(false)
  const [query, setQuery] = useState('')
  const [resultQuery, setResultQuery] = useState('')
  const [resultMode, setResultMode] = useState<SearchMode>('hybrid')
  const [resultView, setResultView] = useState<SearchHistoryView>('results')
  const [searchDocumentId, setSearchDocumentId] = useState<string | null>(null)
  const [resultDocumentId, setResultDocumentId] = useState<string | null>(null)
  const [searchPending, setSearchPending] = useState<'search' | 'answer' | null>(null)
  const [historyRevision, setHistoryRevision] = useState(0)
  const restoredHistoryRevisionRef = useRef(historyRevision)
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchMessage, setSearchMessage] = useState('')
  const [searchFailed, setSearchFailed] = useState(false)
  const [chatResult, setChatResult] = useState<ChatResult | null>(null)
  const [chatError, setChatError] = useState('')
  const [answerStyle, setAnswerStyle] = useState<'concise' | 'detailed'>('concise')
  const [searchMode, setSearchMode] = useState<'vector' | 'keyword' | 'hybrid'>('hybrid')
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => loadRecentSearches(user.id))
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>({ query: '', viewFilter: 'all', modeFilter: 'all' })
  const [recentSearchUndo, setRecentSearchUndo] = useState<{ userId: string; items: RecentSearch[] } | null>(null)
  const [recentSearchStorageMode, setRecentSearchStorageMode] = useState<'checking' | 'persistent' | 'session' | 'memory'>('checking')
  const [savedEvidence, setSavedEvidence] = useState<SavedEvidence[]>(() => loadSavedEvidence(user.id))
  const [savedEvidenceView, setSavedEvidenceView] = useState<SavedEvidenceView>({ query: '', documentId: null, sortOrder: 'newest', page: 1 })
  const [savedEvidenceStorageWarning, setSavedEvidenceStorageWarning] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [sourceCopyMessage, setSourceCopyMessage] = useState<{ id: string; message: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mobileNavMoreRef = useRef<HTMLDetailsElement>(null)
  const detailRequestRef = useRef(0)
  const searchRequestRef = useRef(0)
  const searchBusyRef = useRef(false)
  const documentsRequestRef = useRef(0)
  const previousPageRef = useRef(page)
  const emptyDocumentsLoadErrorRef = useRef(false)
  const focusSearchAfterNavigation = useRef(false)
  const selectSearchAfterNavigation = useRef(false)
  const detailReturnScrollTopRef = useRef<number | null>(null)
  const detailReturnWorkspacePaneRef = useRef<'search' | 'documents'>('search')
  const detailReturnFocusDocumentRef = useRef<{ documentId: string; elementId: string | null } | null>(null)
  const detailReturnSourceIdRef = useRef<string | null>(null)
  const detailReturnDisclosureStatesRef = useRef<Record<string, boolean>>({})
  const previousScrollRestorationRef = useRef<ScrollRestoration | null>(null)
  const readinessRequestRef = useRef<Promise<Ready> | null>(null)
  const legacyChunksRef = useRef<{ documentId: string; chunks: DocDetail['chunks'] } | null>(null)
  const documentReturnPageRef = useRef<'search' | 'documents' | 'favorites' | 'saved'>('documents')

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      const menu = mobileNavMoreRef.current
      if (!menu) return
      if (!menu.open || menu.contains(event.target as Node)) return
      menu.open = false
    }
    function closeOnEscape(event: KeyboardEvent) {
      const menu = mobileNavMoreRef.current
      if (!menu) return
      if (event.key !== 'Escape' || !menu.open) return
      menu.open = false
      menu.querySelector<HTMLElement>('summary')?.focus()
    }
    window.document.addEventListener('pointerdown', closeOnOutsidePress)
    window.document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.document.removeEventListener('pointerdown', closeOnOutsidePress)
      window.document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (mobileNavMoreRef.current?.open) mobileNavMoreRef.current.open = false
  }, [page])

  useEffect(() => {
    if (page === 'detail') return
    const restoreScroll = page === documentReturnPageRef.current && detailReturnScrollTopRef.current !== null
    const previousScrollRestoration = previousScrollRestorationRef.current
    if (!restoreScroll && previousScrollRestoration !== null) {
      window.history.scrollRestoration = previousScrollRestoration
      previousScrollRestorationRef.current = null
    }
    if (!restoreScroll) {
      detailReturnScrollTopRef.current = null
      detailReturnSourceIdRef.current = null
      return
    }
    const scrollTop = detailReturnScrollTopRef.current!
    detailReturnScrollTopRef.current = null
    let restoreFrame = 0
    let releaseTimer = 0
    restoreFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTop, behavior: 'instant' })
        if (previousScrollRestoration !== null) {
          releaseTimer = window.setTimeout(() => {
            window.history.scrollRestoration = previousScrollRestoration
            previousScrollRestorationRef.current = null
          }, 0)
        }
      })
    })
    return () => {
      window.cancelAnimationFrame(restoreFrame)
      window.clearTimeout(releaseTimer)
      if (previousScrollRestorationRef.current !== null) {
        window.history.scrollRestoration = previousScrollRestorationRef.current
        previousScrollRestorationRef.current = null
      }
    }
  }, [page])

  useEffect(() => {
    setRecentSearchStorageMode(saveRecentSearches(user.id, recentSearches))
  }, [recentSearches, user.id])

  useEffect(() => {
    if (!recentSearchUndo) return
    const timer = window.setTimeout(() => setRecentSearchUndo(null), 8000)
    return () => window.clearTimeout(timer)
  }, [recentSearchUndo])

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_DOCUMENTS_KEY(user.id), JSON.stringify(favoriteDocumentIds))
      setFavoriteStorageWarning(false)
    } catch {
      setFavoriteStorageWarning(true)
    }
  }, [favoriteDocumentIds, user.id])

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_DOCUMENTS_KEY(user.id), JSON.stringify(recentDocumentIds))
    } catch {
      // Recently opened documents are a convenience, so the app works when storage is unavailable.
    }
  }, [recentDocumentIds])

  useEffect(() => {
    try {
      localStorage.setItem(savedEvidenceKey(user.id), JSON.stringify(savedEvidence))
      setSavedEvidenceStorageWarning(false)
    } catch {
      setSavedEvidenceStorageWarning(true)
    }
  }, [savedEvidence, user.id])

  useEffect(() => {
    function syncBrowserStorage(event: StorageEvent) {
      let localStore: Storage
      try {
        localStore = window.localStorage
      } catch {
        return
      }
      if (event.storageArea !== localStore) return
      if (event.key === null || event.key === FAVORITE_DOCUMENTS_KEY(user.id)) {
        setFavoriteDocumentIds(loadFavoriteDocumentIds(user.id))
      }
      if (event.key === null || event.key === RECENT_DOCUMENTS_KEY(user.id)) {
        setRecentDocumentIds(loadRecentDocumentIds(user.id))
      }
      if (event.key === RECENT_SEARCHES_KEY(user.id)) {
        setRecentSearches(loadRecentSearches(user.id))
      }
      if (event.key === null || event.key === savedEvidenceKey(user.id)) {
        setSavedEvidence(loadSavedEvidence(user.id))
      }
    }

    window.addEventListener('storage', syncBrowserStorage)
    return () => window.removeEventListener('storage', syncBrowserStorage)
  }, [user.id])

  useEffect(() => {
    if (!documentsLoaded || documentsError) return
    const documentIds = new Set(documents.map(doc => doc.id))
    setFavoriteDocumentIds(current => current.filter(id => documentIds.has(id)))
    setRecentDocumentIds(current => current.filter(id => documentIds.has(id)))
    // Saved excerpts are a local archive; keep them even when the source document is deleted.
  }, [documents, documentsError, documentsLoaded])

  function toggleFavoriteDocument(documentId: string) {
    setFavoriteDocumentIds(current => current.includes(documentId)
      ? current.filter(id => id !== documentId)
      : [...current, documentId].slice(-500))
  }

  function toggleSavedEvidence(source: SearchResult, query: string) {
    const alreadySaved = savedEvidence.some(item => item.chunk_id === source.chunk_id)
    if (!alreadySaved && savedEvidence.length >= 200) {
      setNotice('저장한 근거는 최대 200개까지 보관할 수 있어요. 저장 근거에서 필요 없는 항목을 정리한 뒤 다시 저장해 주세요.')
      return
    }
    setSavedEvidence(current => {
      if (current.some(item => item.chunk_id === source.chunk_id)) {
        return current.filter(item => item.chunk_id !== source.chunk_id)
      }
      return [{ ...source, query: query.trim().slice(0, 2000), saved_at: Date.now() }, ...current]
    })
  }

  function removeRecentSearch(item: Pick<RecentSearch, 'query' | 'documentId' | 'mode' | 'view' | 'createdAt'>) {
    const key = `${normalizeRecentSearchKey(item.query)}:${item.documentId ?? ''}:${item.mode}:${item.view}:${item.createdAt ?? ''}`
    setRecentSearches(current => current.filter(entry =>
      `${normalizeRecentSearchKey(entry.query)}:${entry.documentId ?? ''}:${entry.mode}:${entry.view}:${entry.createdAt ?? ''}` !== key,
    ))
  }

  function clearRecentSearches() {
    if (recentSearches.length === 0) return
    setRecentSearchUndo({ userId: user.id, items: recentSearches })
    setRecentSearches([])
  }

  function restoreRecentSearches() {
    if (!recentSearchUndo || recentSearchUndo.userId !== user.id || recentSearchUndo.items.length === 0) return
    setRecentSearches(current => {
      return mergeRestoredRecentSearches(recentSearchUndo.items, current)
    })
    setRecentSearchUndo(null)
  }

  function clearRecentSearchesAndFocusSearch() {
    clearRecentSearches()
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  function toggleWorkspaceFavorite(documentId: string) {
    toggleFavoriteDocument(documentId)
    window.requestAnimationFrame(() => document.getElementById(`workspace-favorite-${documentId}`)?.focus())
  }

  function normalizeDocumentDetail(payload: DocDetail, offset: number): DocDetail {
    const chunks = Array.isArray(payload.chunks) ? payload.chunks : []
    if (typeof payload.chunk_offset === 'number' && typeof payload.chunk_limit === 'number') return payload
    legacyChunksRef.current = { documentId: payload.id, chunks }
    const chunkCount = Number.isFinite(payload.chunk_count) ? payload.chunk_count : chunks.length
    return {
      ...payload,
      chunk_count: chunkCount,
      chunk_offset: offset,
      chunk_limit: DETAIL_CHUNK_PAGE_SIZE,
      chunks: chunks.slice(offset, offset + DETAIL_CHUNK_PAGE_SIZE),
    }
  }

  const refreshDocuments = useCallback(async () => {
    const requestId = ++documentsRequestRef.current
    setDocumentsRefreshing(true)
    try {
      const response = await fetchInteractiveRequest(`${API}/api/documents`, {}, 30_000)
      if (!response.ok) {
        const failure = await readApiResponse(response)
        throw new Error(apiMessage(failure, `문서 목록을 불러오지 못했습니다. (${response.status})`))
      }
      const result = await readApiResponse(response)
      if (!Array.isArray(result)) throw new Error(apiMessage(result, '문서 목록 응답 형식을 확인할 수 없습니다.'))
      if (requestId === documentsRequestRef.current) {
        setDocuments(result)
        setDocumentsError('')
        return result as Doc[]
      }
      return null
    } catch (error) {
      if (requestId === documentsRequestRef.current) {
        setDocumentsError(friendlyError(error, '문서 목록을 불러오지 못했습니다.'))
      }
      return null
    } finally {
      if (requestId === documentsRequestRef.current) {
        setDocumentsLoaded(true)
        setDocumentsRefreshing(false)
      }
    }
  }, [])

  const checkReadiness = useCallback(async (force = false) => {
    if (!readinessRequestRef.current) {
      readinessRequestRef.current = (async () => {
        const response = await fetchInteractiveRequest(`${API}/api/ready${force ? '?force=true' : ''}`, {}, 120_000)
        if (!response.ok) throw new Error('문서 기능을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.')
        return await readApiResponse(response) as Ready
      })()
    }
    try {
      setReady(await readinessRequestRef.current)
      setApiReachable(true)
    } catch {
      setApiReachable(false)
      setReady(null)
    } finally {
      readinessRequestRef.current = null
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([refreshDocuments(), checkReadiness(true)])
  }, [checkReadiness, refreshDocuments])

  useEffect(() => {
    void refreshDocuments()
    void checkReadiness()
    const refreshOnFocus = () => void refreshDocuments()
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [checkReadiness, refreshDocuments])

  useEffect(() => {
    let active = true
    void fetch(`${API}/openapi.json`)
      .then(response => response.ok ? readApiResponse(response) : null)
      .then(spec => {
        if (active) setOriginalDownloadAvailable(Boolean(spec?.paths?.['/api/documents/{document_id}/file']))
      })
      .catch(() => { if (active) setOriginalDownloadAvailable(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const titles = {
      search: resultQuery ? (resultView === 'answer' ? '검색 답변' : '검색 결과') : '문서 검색',
      documents: '내 문서',
      detail: selectedDocument?.filename ?? '문서 내용',
      about: '프로젝트 소개',
      guide: '사용 안내',
      activity: '검색 기록',
      account: '계정 관리',
      favorites: '즐겨찾기',
      saved: '저장한 근거',
    }
    document.title = `${titles[page]} · 문서담`
  }, [page, selectedDocument?.filename, resultQuery, resultView])

  useEffect(() => () => {
    document.title = '문서담 · 사내 문서 검색'
  }, [])

  useEffect(() => {
    if (previousPageRef.current === page) return
    previousPageRef.current = page
    const frame = window.requestAnimationFrame(() => {
      if (page === documentReturnPageRef.current && (page === 'search' || page === 'saved')) {
        document.querySelectorAll<HTMLDetailsElement>('[data-detail-return-disclosure]').forEach(details => {
          const key = details.dataset.detailReturnDisclosure
          if (key && Object.prototype.hasOwnProperty.call(detailReturnDisclosureStatesRef.current, key)) {
            details.open = detailReturnDisclosureStatesRef.current[key]
          }
        })
        detailReturnDisclosureStatesRef.current = {}
      } else if (page !== 'detail' && page !== documentReturnPageRef.current) {
        detailReturnDisclosureStatesRef.current = {}
        detailReturnSourceIdRef.current = null
        detailReturnFocusDocumentRef.current = null
      }
      const isReturningToDocumentOrigin = page === documentReturnPageRef.current
      const sourceReturnTarget = isReturningToDocumentOrigin && detailReturnSourceIdRef.current
        ? document.getElementById(detailReturnSourceIdRef.current)
        : null
      const returnFocus = isReturningToDocumentOrigin ? detailReturnFocusDocumentRef.current : null
      const returnFocusTarget = returnFocus
        ? [
          ...(returnFocus.elementId ? [returnFocus.elementId] : []),
          `library-document-${returnFocus.documentId}`,
          `favorite-document-${returnFocus.documentId}`,
          `home-favorite-document-${returnFocus.documentId}`,
          `home-recent-document-${returnFocus.documentId}`,
          `workspace-doc-${returnFocus.documentId}`,
          `workspace-topic-doc-${returnFocus.documentId}`,
          `workspace-mobile-topic-doc-workspace-${returnFocus.documentId}`,
          `workspace-mobile-topic-doc-search-${returnFocus.documentId}`,
        ].map(id => document.getElementById(id)).find(element => element && element.getClientRects().length > 0)
        : null
      if (sourceReturnTarget) {
        sourceReturnTarget.focus({ preventScroll: true })
        detailReturnSourceIdRef.current = null
        detailReturnFocusDocumentRef.current = null
      } else if (returnFocusTarget) {
        returnFocusTarget.focus({ preventScroll: true })
        detailReturnSourceIdRef.current = null
        detailReturnFocusDocumentRef.current = null
      } else {
        if (isReturningToDocumentOrigin) detailReturnSourceIdRef.current = null
        if (isReturningToDocumentOrigin) detailReturnFocusDocumentRef.current = null
        document.querySelector<HTMLElement>(page === 'search' && workspacePane === 'documents'
          ? '#workspace-documents-panel h2'
          : '#page-content h1')?.focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page, workspacePane])

  useEffect(() => {
    if (page === 'detail' && selectedDocument) {
      document.querySelector<HTMLHeadingElement>('.detail-title h1')?.focus({ preventScroll: true })
    }
  }, [page, selectedDocument?.id])

  useEffect(() => {
    if (page === 'search' && workspacePane === 'search' && focusSearchAfterNavigation.current) {
      const focusTimer = window.setTimeout(() => {
        focusSearchInput(selectSearchAfterNavigation.current)
        selectSearchAfterNavigation.current = false
        focusSearchAfterNavigation.current = false
      }, 30)
      return () => window.clearTimeout(focusTimer)
    }
  }, [page, workspacePane])

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if (isImeCompositionEvent(event)) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        const target = event.target
        const editingTarget = target instanceof HTMLElement
          ? target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
          : null
        const editingOutsideSearch = editingTarget && !searchInputRef.current?.contains(editingTarget)
        const dialogOpen = document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
        if (editingOutsideSearch || dialogOpen) return
        event.preventDefault()
        focusSearchAfterNavigation.current = true
        selectSearchAfterNavigation.current = true
        navigate('search')
        setWorkspacePane('search')
        if (page === 'search' && workspacePane === 'search') {
          focusSearchInput(true)
          selectSearchAfterNavigation.current = false
          focusSearchAfterNavigation.current = false
        } else {
          focusSearchAfterNavigation.current = true
        }
      }
      if (document.activeElement === searchInputRef.current && shouldClearSearchOnEscape(event, Boolean(query))) {
        event.preventDefault()
        setQuery('')
      }
    }
    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [page, query])

  useEffect(() => {
    const syncRoute = async () => {
      const detailMatch = location.pathname.match(/^\/documents\/([^/]+)$/)
      if (detailMatch) {
        const hasChunkAnchor = location.hash.startsWith('#chunk-')
        const chunkMatch = location.hash.match(/^#chunk-(\d+)$/)
        const anchorChunkNumber = chunkMatch ? Number(chunkMatch[1]) : NaN
        const routeChunkIndex = Number.isSafeInteger(anchorChunkNumber) && anchorChunkNumber > 0 ? anchorChunkNumber - 1 : null
        const offset = routeChunkIndex === null ? 0 : Math.floor(routeChunkIndex / DETAIL_CHUNK_PAGE_SIZE) * DETAIL_CHUNK_PAGE_SIZE
        setRecentDocumentIds(current => [detailMatch[1], ...current.filter(id => id !== detailMatch[1])].slice(0, 20))
        const requestId = ++detailRequestRef.current
        setPage('detail'); setDetailLoading(true)
        setSelectedDocument(null); setDocumentDetail(null); setSelectedExcerpt(null); setSelectedChunkIndex(routeChunkIndex); setSelectedSearchQuery(readDocumentFocusQuery(window.history.state)); setDetailPreviewUnavailable(false)
        try {
          const response = await fetchInteractiveRequest(`${API}/api/documents/${detailMatch[1]}?offset=${offset}&limit=${DETAIL_CHUNK_PAGE_SIZE}`, {}, 60_000)
          const result = await readApiResponse(response)
          if (requestId !== detailRequestRef.current) return
          if (response.status === 405) {
            const docsResponse = await fetchInteractiveRequest(`${API}/api/documents`, {}, 30_000)
            const docs = await readApiResponse(docsResponse) as Doc[]
            if (requestId !== detailRequestRef.current) return
            const doc = docs.find(item => item.id === detailMatch[1])
            if (doc) {
              const validChunkIndex = routeChunkIndex !== null && routeChunkIndex < doc.chunk_count ? routeChunkIndex : null
              setSelectedChunkIndex(validChunkIndex)
              setSelectedDocument(doc); setDocumentDetail({ ...doc, chunk_offset: validChunkIndex === null ? 0 : offset, chunk_limit: DETAIL_CHUNK_PAGE_SIZE, chunks: [] }); setDetailPreviewUnavailable(true)
              if (hasChunkAnchor && validChunkIndex === null) window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`)
            }
            else throw new Error('문서를 찾을 수 없습니다.')
          } else {
            if (!response.ok) throw new Error(apiMessage(result, '문서 내용을 불러오지 못했습니다.'))
            let detail = normalizeDocumentDetail(result, offset)
            const validChunkIndex = routeChunkIndex !== null && routeChunkIndex < detail.chunk_count ? routeChunkIndex : null
            if (hasChunkAnchor && validChunkIndex === null && offset !== 0) {
              const firstPageResponse = await fetchInteractiveRequest(`${API}/api/documents/${detailMatch[1]}?offset=0&limit=${DETAIL_CHUNK_PAGE_SIZE}`, {}, 60_000)
              const firstPageResult = await readApiResponse(firstPageResponse)
              if (requestId !== detailRequestRef.current) return
              if (!firstPageResponse.ok) throw new Error(apiMessage(firstPageResult, '문서 첫 구간을 불러오지 못했습니다.'))
              detail = normalizeDocumentDetail(firstPageResult, 0)
            }
            setSelectedChunkIndex(validChunkIndex)
            if (hasChunkAnchor && validChunkIndex === null) window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`)
            setSelectedDocument(detail); setDocumentDetail(detail); setDetailPreviewUnavailable(false)
          }
        } catch (error) { if (requestId === detailRequestRef.current) setNotice(friendlyError(error, '문서 내용을 불러오지 못했습니다.')) }
        finally { if (requestId === detailRequestRef.current) setDetailLoading(false) }
      } else {
        detailRequestRef.current += 1
        const nextPage = pageForPath(location.pathname)
        setPage(nextPage)
        if (nextPage === 'search') {
          const returningFromDocument = previousPageRef.current === 'detail' && documentReturnPageRef.current === 'search'
          setWorkspacePane(returningFromDocument ? detailReturnWorkspacePaneRef.current : 'search')
        }
        setSelectedDocument(null); setDocumentDetail(null); setSelectedExcerpt(null); setSelectedChunkIndex(null); setSelectedSearchQuery(null); setDetailPreviewUnavailable(false); setDetailLoading(false)
      }
    }
    const handlePopState = () => {
      const returningToQuestionDraft = previousPageRef.current === 'detail'
        && documentReturnPageRef.current === 'search'
        && pageForPath(location.pathname) === 'search'
        && !readSearchHistoryEntry(window.history.state)
      if (!returningToQuestionDraft) setHistoryRevision(current => current + 1)
      void syncRoute()
    }
    window.addEventListener('popstate', handlePopState)
    if (location.pathname !== '/') void syncRoute()
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigate(nextPage: Exclude<AppPage, 'detail'>, replaceHistory = false, searchEntryOverride?: SearchHistoryEntry | null) {
    detailRequestRef.current += 1
    const returningFromDocument = page === 'detail' && nextPage === 'search' && documentReturnPageRef.current === 'search'
    if (returningFromDocument) {
      focusSearchAfterNavigation.current = detailReturnWorkspacePaneRef.current === 'search'
        && !detailReturnSourceIdRef.current && !detailReturnFocusDocumentRef.current?.elementId
    }
    const restoreDetailPosition = nextPage === documentReturnPageRef.current && detailReturnScrollTopRef.current !== null
    if (page === 'detail' && !restoreDetailPosition) {
      detailReturnScrollTopRef.current = null
      detailReturnSourceIdRef.current = null
    }
    const nextPath = ({ search: '/', documents: '/documents', guide: '/guide', about: '/about', activity: '/activity', account: '/account', favorites: '/favorites', saved: '/saved' } as const)[nextPage]
    const searchEntry = nextPage === 'search'
      ? searchEntryOverride === undefined
        ? resultQuery ? { query: resultQuery, mode: resultMode, view: resultView, documentId: resultDocumentId } : null
        : searchEntryOverride
      : null
    const currentEntry = readSearchHistoryEntry(window.history.state)
    const sameEntry = currentEntry?.query === searchEntry?.query
      && currentEntry?.mode === searchEntry?.mode
      && currentEntry?.view === searchEntry?.view
      && currentEntry?.documentId === searchEntry?.documentId
    const shouldUpdateHistory = location.pathname !== nextPath || !sameEntry
    if (shouldUpdateHistory) {
      const nextState = mergeSearchHistoryEntry(window.history.state, searchEntry)
      if (replaceHistory) window.history.replaceState(nextState, '', nextPath)
      else window.history.pushState(nextState, '', nextPath)
    }
    if (page !== nextPage) setNotice('')
    setPage(nextPage)
    if (nextPage === 'search') setWorkspacePane(returningFromDocument ? detailReturnWorkspacePaneRef.current : 'search')
    setSelectedDocument(null); setDocumentDetail(null); setSelectedExcerpt(null); setSelectedChunkIndex(null); setSelectedSearchQuery(null); setDetailPreviewUnavailable(false)
    if (page !== nextPage && !restoreDetailPosition) window.scrollTo({ top: 0, behavior: preferredScrollBehavior() })
  }

  function prepareQuestion(documentId: string | null, initialQuery = '') {
    searchRequestRef.current += 1
    setQuery(initialQuery)
    setSearchDocumentId(documentId)
    setResultQuery('')
    setResultDocumentId(documentId)
    setResultView('results')
    setResults([])
    setSearchMessage('')
    setSearchFailed(false)
    setChatResult(null)
    setChatError('')
    setSearchPending(null)
    setCopyMessage('')
    setSourceCopyMessage(null)
  }

  function startNewQuestion() {
    if (busy) return
    prepareQuestion(searchDocumentId)
    navigate('search', false, null)
    window.requestAnimationFrame(() => focusSearchInput())
  }

  function openQuestionDraft(question: string, documentId: string | null = null, mode = searchMode) {
    prepareQuestion(documentId, question)
    setSearchMode(mode)
    focusSearchAfterNavigation.current = true
    navigate('search', false, null)
  }

  function askAboutDocument(doc: Doc, initialQuery = '') {
    prepareQuestion(doc.id, initialQuery)
    documentReturnPageRef.current = 'search'
    detailReturnWorkspacePaneRef.current = 'search'
    detailReturnFocusDocumentRef.current = null
    detailReturnScrollTopRef.current = null
    focusSearchAfterNavigation.current = true
    navigate('search', false, null)
  }

  function askAboutWorkspaceDocument(doc: Doc, initialQuery = '') {
    const alreadyOnSearch = page === 'search'
    askAboutDocument(doc, initialQuery)
    if (alreadyOnSearch && workspacePane === 'search') {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus()
        focusSearchAfterNavigation.current = false
      })
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    if (busy) {
      setNotice('현재 문서 작업을 처리하고 있어요. 작업이 끝난 뒤 파일을 다시 추가해 주세요.')
      return
    }
    const selectedFiles = Array.from(files)
    const rejectedFiles = selectedFiles
      .map(file => uploadIssue(file))
      .filter((issue): issue is string => issue !== null)
    const uploadableFiles = selectedFiles.filter(file => uploadIssue(file) === null)
    if (uploadableFiles.length === 0) {
      setUploadedDocumentsSearchable(false)
      setDuplicateUploads([])
      setNotice(rejectedFiles.join('\n') || '추가할 수 있는 파일이 없습니다.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setBusy(true); setNotice(''); setDuplicateUploads([]); navigate('documents')
    const outcomes: string[] = [...rejectedFiles]
    const duplicateTargets: Array<{ id: string; filename: string }> = []
    let searchableUploadAdded = false
    setUploadedDocumentsSearchable(false)
    for (const [index, file] of uploadableFiles.entries()) {
      setUploadProgress({ current: index + 1, total: uploadableFiles.length, filename: file.name, elapsedSeconds: 0 })
      setNotice(`${uploadableFiles.length}개 중 ${index + 1}번째 파일을 처리하고 있습니다 · ${file.name}`)
      const body = new FormData(); body.append('file', file)
      try {
        const response = await fetchInteractiveRequest(
          `${API}/api/documents`,
          { method: 'POST', body },
          DOCUMENT_UPLOAD_TIMEOUT_MS,
          DOCUMENT_UPLOAD_TIMEOUT_MESSAGE,
        )
        const result = await readApiResponse(response)
        if (response.status === 409) {
          if (typeof result?.document_id === 'string' && typeof result?.filename === 'string') {
            duplicateTargets.push({ id: result.document_id, filename: result.filename })
            outcomes.push(`이미 등록되어 있어요 · ${file.name}`)
          } else {
            outcomes.push(`이미 등록됨 · ${file.name}: ${apiMessage(result, '같은 내용의 문서가 이미 있습니다.')}`)
          }
          continue
        }
        if (!response.ok) throw new Error(apiMessage(result, '업로드에 실패했습니다.'))
        if (result.status === 'completed' && result.index_status === 'ready') searchableUploadAdded = true
        const uploadSummary = result.status === 'completed' && result.index_status === 'ready'
          ? `검색 구간 ${result.chunk_count}개`
          : getDocumentChunkSummary(result)
        outcomes.push(result.status === 'failed' ? `읽지 못했어요 · ${file.name}: ${result.error_message}` : result.index_status === 'failed' ? `내용은 읽었지만 검색 준비가 필요해요 · ${file.name}: ${result.error_message}` : `추가했어요 · ${file.name} · ${uploadSummary}`)
      } catch (error) { outcomes.push(`실패 · ${file.name}: ${friendlyError(error, '업로드 중 오류가 발생했습니다.')}`) }
    }
    await refreshDocuments(); setUploadProgress(null); setDuplicateUploads(duplicateTargets); setUploadedDocumentsSearchable(searchableUploadAdded); setBusy(false); setNotice(outcomes.join('\n') || '처리할 파일이 없습니다.')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function addDemoDocuments() {
    if (busy) return
    setUploadedDocumentsSearchable(false)
    const samples = ['HR-01.txt', 'EXP-01.txt', 'IT-01.txt']
    const pending = samples.filter(filename => !documents.some(doc => doc.filename === filename))
    if (!pending.length) { setNotice('예시 문서는 이미 모두 등록되어 있습니다.'); navigate('documents'); return }
    setBusy(true); setNotice(''); setDuplicateUploads([]); navigate('documents')
    const outcomes: string[] = []
    const duplicateTargets: Array<{ id: string; filename: string }> = []
    let searchableDemoAdded = false
    for (const [index, filename] of pending.entries()) {
      setUploadProgress({ current: index + 1, total: pending.length, filename, elapsedSeconds: 0 })
      setNotice(`예시 문서를 등록하고 있습니다 · ${filename}`)
      try {
        const sampleResponse = await fetch(`/demo-documents/${filename}`)
        if (!sampleResponse.ok) throw new Error('예시 파일을 불러오지 못했습니다.')
        const file = new File([await sampleResponse.blob()], filename, { type: 'text/plain' })
        const body = new FormData(); body.append('file', file)
        const response = await fetchInteractiveRequest(
          `${API}/api/documents`,
          { method: 'POST', body },
          DOCUMENT_UPLOAD_TIMEOUT_MS,
          DOCUMENT_UPLOAD_TIMEOUT_MESSAGE,
        )
        const result = await readApiResponse(response)
        if (response.status === 409 && typeof result?.document_id === 'string' && typeof result?.filename === 'string') {
          duplicateTargets.push({ id: result.document_id, filename: result.filename })
          outcomes.push(`이미 등록되어 있어요 · ${filename}`)
          continue
        }
        if (!response.ok) throw new Error(apiMessage(result, '등록에 실패했습니다.'))
        if (result.status === 'completed' && result.index_status === 'ready') searchableDemoAdded = true
        const uploadSummary = result.status === 'completed' && result.index_status === 'ready'
          ? `검색 구간 ${result.chunk_count}개`
          : getDocumentChunkSummary(result)
        outcomes.push(result.status === 'failed'
          ? `읽지 못했어요 · ${filename}: ${result.error_message}`
          : result.index_status === 'failed'
            ? `내용은 읽었지만 검색 준비가 필요해요 · ${filename}: ${result.error_message}`
            : `추가했어요 · ${filename} · ${uploadSummary}`)
      } catch (error) { outcomes.push(`실패 · ${filename}: ${friendlyError(error, '예시 문서 등록 중 오류가 발생했습니다.')}`) }
    }
    await refreshDocuments(); setUploadProgress(null); setDuplicateUploads(duplicateTargets); setUploadedDocumentsSearchable(searchableDemoAdded); setBusy(false); setNotice(`가상 예시 문서 · 실제 사내 자료가 아닙니다\n${outcomes.join('\n')}`)
  }

  async function remove(doc: Doc) {
    if (busy) return
    setDocumentsToDelete([doc])
  }

  function removeSelectedDocuments(selected: Doc[]) {
    if (busy || selected.length === 0) return
    setDocumentsToDelete(selected)
  }

  async function confirmRemove() {
    if (busy || !documentsToDelete?.length) return
    setUploadedDocumentsSearchable(false)
    const targets = [...documentsToDelete]
    setBusy(true)
    const deleted: Doc[] = []
    const failures: string[] = []
    for (const [index, doc] of targets.entries()) {
      setNotice(targets.length > 1 ? `선택한 문서 삭제 중 · ${index + 1}/${targets.length} · ${doc.filename}` : '')
      try {
        const response = await fetchInteractiveRequest(`${API}/api/documents/${doc.id}`, { method: 'DELETE' }, 30_000)
        if (!response.ok) {
          const result = await readApiResponse(response)
          failures.push(`${doc.filename}: ${apiMessage(result, `(${response.status})`)}`)
          continue
        }
        deleted.push(doc)
      } catch (error) {
        failures.push(`${doc.filename}: ${friendlyError(error, '삭제 결과를 확인하지 못했어요.')}`)
      }
    }
    setDocumentsToDelete(null)
    if (deleted.length > 0) {
      const deletedIds = new Set(deleted.map(doc => doc.id))
      setRecentDocumentIds(current => current.filter(id => !deletedIds.has(id)))
      setFocusDocumentHeading(true)
      setResults([])
      setChatResult(null)
      setChatError('')
      setSearchMessage('')
      setResultQuery('')
      if (selectedDocument && deletedIds.has(selectedDocument.id)) {
        setSelectedDocument(null)
        setDocumentDetail(null)
        navigate('documents', true)
      }
    }
    await refreshDocuments()
    const failureSummary = failures.length > 0
      ? `\n삭제하지 못한 ${failures.length}개: ${failures.slice(0, 3).join(' · ')}${failures.length > 3 ? ` · 외 ${failures.length - 3}개` : ''}`
      : ''
    setNotice(deleted.length > 0
      ? `${deleted.length}개 문서 삭제 완료${failureSummary}`
      : `문서를 삭제하지 못했어요.${failureSummary}`)
    setBusy(false)
  }

  async function openDocument(doc: Doc, source: SearchResult | null = null, focusQuery: string | null = null) {
    setRecentDocumentIds(current => [doc.id, ...current.filter(id => id !== doc.id)].slice(0, 20))
    const activeSourceId = source && document.activeElement instanceof HTMLElement ? document.activeElement.id : ''
    const fallbackSourceId = page === 'saved'
      ? `saved-evidence-source-${source?.chunk_id}`
      : page === 'search' && !resultQuery
        ? `recent-saved-evidence-source-${source?.chunk_id}`
        : page === 'search' && resultView === 'answer'
          ? `answer-source-${source?.chunk_id}`
          : `evidence-source-${source?.chunk_id}`
    const sourceReturnTargetId = source ? activeSourceId || fallbackSourceId : null
    if (page !== 'detail') {
      documentReturnPageRef.current = page === 'search' ? 'search' : page === 'favorites' ? 'favorites' : page === 'saved' ? 'saved' : 'documents'
      previousScrollRestorationRef.current = window.history.scrollRestoration
      window.history.scrollRestoration = 'manual'
      detailReturnScrollTopRef.current = window.scrollY
      detailReturnSourceIdRef.current = sourceReturnTargetId
      detailReturnDisclosureStatesRef.current = page === 'search' || page === 'saved'
        ? Object.fromEntries(
          [...document.querySelectorAll<HTMLDetailsElement>('[data-detail-return-disclosure]')]
            .flatMap(details => details.dataset.detailReturnDisclosure
              ? [[details.dataset.detailReturnDisclosure, details.open]]
              : []),
        )
        : {}
      if (page === 'search') {
        detailReturnWorkspacePaneRef.current = workspacePane
        const activeElementId = document.activeElement instanceof HTMLElement ? document.activeElement.id : ''
        const documentFocusIds = [
          `workspace-doc-${doc.id}`,
          `workspace-scope-document-${doc.id}`,
          `workspace-topic-doc-${doc.id}`,
          `workspace-mobile-topic-doc-workspace-${doc.id}`,
          `workspace-mobile-topic-doc-search-${doc.id}`,
          `home-favorite-document-${doc.id}`,
          `home-recent-document-${doc.id}`,
        ]
        detailReturnFocusDocumentRef.current = source ? null : {
          documentId: doc.id,
          elementId: documentFocusIds.includes(activeElementId) ? activeElementId : null,
        }
      } else {
        const activeElementId = document.activeElement instanceof HTMLElement ? document.activeElement.id : ''
        const libraryTopicId = `workspace-topic-doc-${doc.id}`
        detailReturnFocusDocumentRef.current = source || (page !== 'documents' && page !== 'favorites')
          ? null
          : {
            documentId: doc.id,
            elementId: page === 'documents'
              ? activeElementId === libraryTopicId ? libraryTopicId : `library-document-${doc.id}`
              : `favorite-document-${doc.id}`,
          }
      }
    }
    const requestId = ++detailRequestRef.current
    setNotice('')
    const offset = source ? Math.floor(source.chunk_index / DETAIL_CHUNK_PAGE_SIZE) * DETAIL_CHUNK_PAGE_SIZE : 0
    const detailPath = documentUrl(doc.id, source?.chunk_index)
    const detailHistoryState = mergeDocumentFocusQuery(window.history.state, focusQuery)
    if (`${location.pathname}${location.search}${location.hash}` !== detailPath) window.history.pushState(detailHistoryState, '', detailPath)
    else window.history.replaceState(detailHistoryState, '', detailPath)
    setSelectedDocument(doc); setSelectedExcerpt(source?.excerpt ?? null); setSelectedChunkIndex(source?.chunk_index ?? null); setSelectedSearchQuery(focusQuery?.trim() || null); setDetailPreviewUnavailable(false); setDocumentDetail(null); setDetailLoading(true); setPage('detail')
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() })
    try {
      const response = await fetchInteractiveRequest(`${API}/api/documents/${doc.id}?offset=${offset}&limit=${DETAIL_CHUNK_PAGE_SIZE}`, {}, 60_000)
      const result = await readApiResponse(response)
      if (requestId !== detailRequestRef.current) return
      if (response.status === 405) { setDocumentDetail({ ...doc, chunk_offset: offset, chunk_limit: DETAIL_CHUNK_PAGE_SIZE, chunks: [] }); setDetailPreviewUnavailable(true) }
      else {
        if (!response.ok) throw new Error(apiMessage(result, '문서 내용을 불러오지 못했습니다.'))
        setDocumentDetail(normalizeDocumentDetail(result, offset))
      }
    } catch (error) { if (requestId === detailRequestRef.current) setNotice(friendlyError(error, '문서 내용을 불러오지 못했습니다.')) }
    finally { if (requestId === detailRequestRef.current) setDetailLoading(false) }
  }

  async function loadDocumentChunkPage(offset: number, focusChunkIndex: number | null = null) {
    if (!selectedDocument || detailLoading) return
    function selectLoadedChunk() {
      setSelectedExcerpt(null)
      setSelectedChunkIndex(focusChunkIndex)
      const nextHash = focusChunkIndex === null ? '' : `#chunk-${focusChunkIndex + 1}`
      if (location.hash !== nextHash) window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}${nextHash}`)
    }
    const legacy = legacyChunksRef.current
    if (legacy?.documentId === selectedDocument.id && documentDetail) {
      setDocumentDetail({
        ...documentDetail,
        chunk_offset: offset,
        chunk_limit: DETAIL_CHUNK_PAGE_SIZE,
        chunks: legacy.chunks.slice(offset, offset + DETAIL_CHUNK_PAGE_SIZE),
      })
      selectLoadedChunk()
      return
    }
    const requestId = ++detailRequestRef.current
    setDetailLoading(true)
    setNotice('')
    try {
      const response = await fetchInteractiveRequest(`${API}/api/documents/${selectedDocument.id}?offset=${offset}&limit=${DETAIL_CHUNK_PAGE_SIZE}`, {}, 60_000)
      const result = await readApiResponse(response)
      if (requestId !== detailRequestRef.current) return
      if (!response.ok) throw new Error(apiMessage(result, '문서 구간을 불러오지 못했습니다.'))
      setDocumentDetail(normalizeDocumentDetail(result, offset))
      selectLoadedChunk()
    } catch (error) {
      if (requestId === detailRequestRef.current) setNotice(friendlyError(error, '문서 구간을 불러오지 못했습니다.'))
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false)
    }
  }

  function navigateToDocumentChunk(chunkIndex: number) {
    if (detailLoading || !selectedDocument || !documentDetail || !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= documentDetail.chunk_count) return
    const targetOffset = Math.floor(chunkIndex / DETAIL_CHUNK_PAGE_SIZE) * DETAIL_CHUNK_PAGE_SIZE
    if (documentDetail.chunk_offset === targetOffset) {
      setSelectedExcerpt(null)
      setSelectedChunkIndex(chunkIndex)
      const nextHash = `#chunk-${chunkIndex + 1}`
      if (location.hash !== nextHash) window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}${nextHash}`)
      window.requestAnimationFrame(() => {
        const target = document.getElementById(`chunk-${chunkIndex + 1}`)
        target?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center' })
        target?.focus({ preventScroll: true })
      })
      return
    }
    void loadDocumentChunkPage(targetOffset, chunkIndex)
  }

  async function openSource(source: SearchResult) {
    let availableDocuments = documents
    if (!documentsLoaded) {
      setNotice('원문을 열기 위해 문서 목록을 확인하고 있어요…')
      const refreshedDocuments = await refreshDocuments()
      if (!refreshedDocuments) {
        const message = '문서 목록을 불러오지 못해 원문을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.'
        setNotice(message)
        return
      }
      availableDocuments = refreshedDocuments
    }
    const doc = availableDocuments.find(item => item.id === source.document_id)
    if (doc) {
      const savedQuery = 'query' in source && typeof source.query === 'string' ? source.query : null
      void openDocument(doc, source, savedQuery ?? resultQuery)
    }
    else {
      const message = '원문 문서를 찾을 수 없습니다. 문서함을 새로 확인한 뒤 다시 시도해 주세요.'
      setNotice(message)
    }
  }

  async function indexDocument(doc: Doc) {
    if (busy) return
    setUploadedDocumentsSearchable(false)
    setBusy(true); setNotice(`${doc.filename}: 검색 준비를 다시 하고 있어요.`)
    try {
      const response = await fetch(`${API}/api/documents/${doc.id}/index`, { method: 'POST' })
      const result = await readApiResponse(response)
      if (!response.ok) throw new Error(apiMessage(result, '검색 인덱스를 만들지 못했습니다.'))
      setUploadedDocumentsSearchable(true)
      if (selectedDocument?.id === doc.id) setSelectedDocument(result)
      setDocumentDetail(current => current?.id === doc.id ? { ...current, ...result } : current)
      setNotice(`${doc.filename}: 이제 다시 찾아볼 수 있어요.`)
    } catch (error) { setNotice(`${doc.filename}: ${friendlyError(error, '검색 준비를 다시 하지 못했습니다.')}`) }
    await refreshDocuments(); setBusy(false)
  }

  async function retryDocumentExtraction(doc: Doc) {
    if (busy) return
    setUploadedDocumentsSearchable(false)
    setBusy(true); setNotice(`${doc.filename}: 원본 파일을 다시 읽고 있어요.`)
    try {
      const response = await fetch(`${API}/api/documents/${doc.id}/extract`, { method: 'POST' })
      const result = await readApiResponse(response)
      if (!response.ok) throw new Error(apiMessage(result, '파일을 다시 읽지 못했습니다.'))
      setWorkspaceOutlines(current => {
        if (!current[doc.id]) return current
        const next = { ...current }
        delete next[doc.id]
        return next
      })
      setDocumentOutlineRevision(revision => revision + 1)
      setUploadedDocumentsSearchable(result.index_status === 'ready')
      const isOpenDocument = selectedDocument?.id === doc.id
      if (isOpenDocument) {
        setSelectedDocument(result)
        const requestId = ++detailRequestRef.current
        setDetailLoading(true)
        try {
          const detailResponse = await fetchInteractiveRequest(`${API}/api/documents/${doc.id}?offset=0&limit=${DETAIL_CHUNK_PAGE_SIZE}`, {}, 60_000)
          const detailResult = await readApiResponse(detailResponse)
          if (requestId === detailRequestRef.current) {
            if (detailResponse.status === 405) {
              setDocumentDetail({ ...result, chunk_offset: 0, chunk_limit: DETAIL_CHUNK_PAGE_SIZE, chunks: [] })
              setDetailPreviewUnavailable(true)
            } else {
              if (!detailResponse.ok) throw new Error(apiMessage(detailResult, '다시 읽은 문서 내용을 불러오지 못했습니다.'))
              setDocumentDetail(normalizeDocumentDetail(detailResult, 0))
              setDetailPreviewUnavailable(false)
            }
            setSelectedExcerpt(null)
            setSelectedChunkIndex(null)
          }
        } finally {
          if (requestId === detailRequestRef.current) setDetailLoading(false)
        }
      }
      setNotice(result.index_status === 'ready'
        ? `${doc.filename}: 파일을 다시 읽고 검색 준비까지 마쳤어요.`
        : `${doc.filename}: 파일은 다시 읽었지만 검색 준비에 실패했어요. 다시 처리 버튼으로 이어서 시도할 수 있어요.`)
    } catch (error) {
      setNotice(`${doc.filename}: ${friendlyError(error, '파일을 다시 읽거나 새 문서 내용을 불러오지 못했습니다.')}`)
    }
    await refreshDocuments(); setBusy(false)
  }

  function openDuplicateDocument(documentId: string) {
    const duplicate = documents.find(doc => doc.id === documentId)
    if (duplicate) {
      void openDocument(duplicate)
      return
    }
    setNotice('이미 등록된 문서를 목록에서 찾지 못했습니다. 문서 목록을 새로 불러와 주세요.')
    void refreshDocuments()
  }

  function recordSearchHistoryEntry(query: string, mode: SearchMode, view: SearchHistoryView, documentId: string | null, pushAnswerTransition = false) {
    const entry = { query, mode, view, documentId }
    const current = readSearchHistoryEntry(window.history.state)
    const nextState = mergeSearchHistoryEntry(window.history.state, entry)
    const currentUrl = `${location.pathname}${location.search}${location.hash}`
    const isAnswerTransition = pushAnswerTransition && current?.query === query && current.mode === mode && current.view === 'results' && current.documentId === documentId && view === 'answer'
    const isScopeTransition = current?.query === query && current.mode === mode && current.view === view && current.documentId !== documentId
    if (isAnswerTransition || isScopeTransition) {
      window.history.pushState(nextState, '', currentUrl)
    } else {
      window.history.replaceState(nextState, '', currentUrl)
    }
  }

  function canUseDocumentScope(documentId: string | null) {
    if (!documentId) return true
    if (!documentsLoaded) return false
    return documents.some(doc => doc.id === documentId && getDocumentLifecycle(doc.status, doc.index_status) === 'searchable')
  }

  async function searchFor(searchQuery: string, mode = searchMode, documentId = searchDocumentId) {
    if (!searchQuery.trim() || busy && !searchBusyRef.current || databaseUnavailable || !canUseDocumentScope(documentId) || (mode !== 'keyword' && semanticSearchUnavailable)) return
    const normalizedQuery = searchQuery.trim()
    const requestId = ++searchRequestRef.current
    recordSearchHistoryEntry(normalizedQuery, mode, 'results', documentId)
    setQuery(normalizedQuery)
    setResultQuery(normalizedQuery)
    setResultMode(mode)
    setResultView('results')
    setSearchDocumentId(documentId)
    setResultDocumentId(documentId)
    setRecentSearches(current => addRecentSearch(current, normalizedQuery, mode, 'results', documentId))
    searchBusyRef.current = true
    setSearchPending('search')
    setBusy(true); setChatResult(null); setChatError(''); setSearchFailed(false); setSearchMessage('문서에서 관련 내용을 찾고 있습니다…'); setResults([])
    try {
      const response = await fetchInteractiveRequest(`${API}/api/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: normalizedQuery, top_k: 5, mode, document_id: documentId }) })
      const result = await readApiResponse(response)
      const currentEntry = readSearchHistoryEntry(window.history.state)
      if (requestId !== searchRequestRef.current || !sameSearchHistoryEntry(currentEntry, { query: normalizedQuery, mode, view: 'results', documentId })) return
      if (!response.ok) throw new Error(apiMessage(result, '검색에 실패했습니다.'))
      const relevanceLimit = ready?.retrieval?.max_cosine_distance ?? 0.68
      const retrieved = Array.isArray(result.results) ? result.results as SearchResult[] : []
      const relevantResults = mode === 'vector'
        ? retrieved.filter(item => typeof item.cosine_distance !== 'number' || item.cosine_distance <= relevanceLimit)
        : mode === 'hybrid'
          ? retrieved.filter(item => item.match_type === 'keyword' || item.cosine_distance == null || item.cosine_distance <= relevanceLimit)
          : retrieved
      setResults(relevantResults)
      setSearchMessage(relevantResults.length ? `검색 결과 ${relevantResults.length}개 · ${mode === 'vector' ? '비슷한 내용' : mode === 'keyword' ? '정확한 단어' : '함께 찾기'}` : '관련 내용을 찾지 못했어요.')
    } catch (error) {
      const currentEntry = readSearchHistoryEntry(window.history.state)
      if (requestId === searchRequestRef.current && sameSearchHistoryEntry(currentEntry, { query: normalizedQuery, mode, view: 'results', documentId })) {
        setSearchFailed(true)
        setSearchMessage(friendlyError(error, '검색 중 오류가 발생했습니다.'))
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        searchBusyRef.current = false
        setSearchPending(null)
        setBusy(false)
      }
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault()
    await searchFor(query)
  }

  function focusSearchInput(selectQuery = false) {
    const input = searchInputRef.current
    if (!input) return
    input.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center' })
    input.focus({ preventScroll: true })
    if (selectQuery) input.select()
  }

  function changeSearchScope(documentId: string | null) {
    setSearchDocumentId(documentId)
    if (!resultQuery || busy || searchDraftChanged) return
    if (resultView === 'answer') void askFor(resultQuery, searchMode, documentId)
    else void searchFor(resultQuery, resultMode, documentId)
  }

  async function askFor(searchQuery: string, historyMode = searchMode, documentId = searchDocumentId, style = answerStyle) {
    if (!searchQuery.trim() || busy && !searchBusyRef.current || databaseUnavailable || !canUseDocumentScope(documentId) || answerUnavailable) return
    const normalizedQuery = searchQuery.trim()
    const requestId = ++searchRequestRef.current
    recordSearchHistoryEntry(normalizedQuery, historyMode, 'answer', documentId, true)
    setQuery(normalizedQuery)
    setResultQuery(normalizedQuery)
    setResultMode('vector')
    setResultView('answer')
    setSearchDocumentId(documentId)
    setResultDocumentId(documentId)
    setRecentSearches(current => addRecentSearch(current, normalizedQuery, 'vector', 'answer', documentId))
    searchBusyRef.current = true
    setSearchPending('answer')
    setBusy(true); setSearchMessage(''); setSearchFailed(false); setResults([]); setChatError(''); setChatResult(null); setCopyMessage('')
    try {
      const response = await fetchInteractiveRequest(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: normalizedQuery, document_id: documentId, answer_style: style }) })
      const result = await readApiResponse(response)
      const currentEntry = readSearchHistoryEntry(window.history.state)
      if (requestId !== searchRequestRef.current || !sameSearchHistoryEntry(currentEntry, { query: normalizedQuery, mode: historyMode, view: 'answer', documentId })) return
      if (!response.ok) throw new Error(apiMessage(result, '답변을 만들지 못했습니다.'))
      setChatResult({ ...result, answer: cleanAnswerText(result.answer, normalizedQuery, result.sources ?? []) })
    } catch (error) {
      const currentEntry = readSearchHistoryEntry(window.history.state)
      if (requestId === searchRequestRef.current && sameSearchHistoryEntry(currentEntry, { query: normalizedQuery, mode: historyMode, view: 'answer', documentId })) {
        setSearchFailed(true)
        setChatError(friendlyError(error, '답변 요청 중 오류가 발생했습니다.'))
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        searchBusyRef.current = false
        setSearchPending(null)
        setBusy(false)
      }
    }
  }

  async function ask() {
    await askFor(query)
  }

  function canRepeatRecentSearch(item: RecentSearch) {
    const scopedDocument = item.documentId ? documents.find(doc => doc.id === item.documentId) : null
    const scopedDocumentReady = !item.documentId
      ? true
      : !documentsLoaded
        ? false
        : scopedDocument
          ? getDocumentLifecycle(scopedDocument.status, scopedDocument.index_status) === 'searchable'
          : !documentsError
    const canRetryAcrossLibrary = Boolean(item.documentId && documentsLoaded && !documentsError && searchableDocuments.length > 0)
    const canFallBackToKeyword = item.mode !== 'keyword' && !databaseUnavailable
    const canFallBackToSearchResults = item.view === 'answer' && !databaseUnavailable
    return !databaseUnavailable
      && (item.mode === 'keyword' || !semanticSearchUnavailable || canFallBackToKeyword)
      && (item.view !== 'answer' || !answerUnavailable || canFallBackToSearchResults)
      && (scopedDocumentReady || canRetryAcrossLibrary)
  }

  function recentSearchScopeNeedsFallback(item: RecentSearch) {
    if (!item.documentId || !documentsLoaded || documentsError) return false
    const scopedDocument = documents.find(doc => doc.id === item.documentId)
    return !scopedDocument || getDocumentLifecycle(scopedDocument.status, scopedDocument.index_status) !== 'searchable'
  }

  function searchScopeDocumentLabel(doc: Doc) {
    return documentDisplayNames.get(doc.id) ?? doc.filename
  }

  function displayDocumentName(documentId: string, fallback: string) {
    return documentDisplayNames.get(documentId) ?? fallback
  }

  function savedSourceAvailability(documentId: string): boolean | null {
    return resolveSavedSourceAvailability(documents, documentsLoaded, documentsError, documentId)
  }

  function recentSearchScopeLabel(item: RecentSearch) {
    if (!item.documentId) return '전체 문서'
    const document = documents.find(doc => doc.id === item.documentId)
    if (document) {
      const lifecycle = getDocumentLifecycle(document.status, document.index_status)
      if (lifecycle === 'searchable') return searchScopeDocumentLabel(document)
      const stateLabel = lifecycle === 'processing' ? '준비 중' : lifecycle === 'extract_failed' ? '읽기 실패' : '다시 처리 필요'
      return `${searchScopeDocumentLabel(document)} · ${stateLabel}`
    }
    if (!documentsLoaded) return '문서 목록 불러오는 중'
    return documentsError ? '문서 목록 확인 필요' : '삭제된 문서'
  }

  function repeatRecentSearch(item: RecentSearch) {
    const scopedDocument = item.documentId ? documents.find(doc => doc.id === item.documentId) : null
    const scopeNeedsFallback = recentSearchScopeNeedsFallback(item)
    const documentId = scopeNeedsFallback ? null : item.documentId
    const modeNeedsFallback = item.mode !== 'keyword' && semanticSearchUnavailable
    const mode = modeNeedsFallback ? 'keyword' : item.mode
    const answerNeedsFallback = item.view === 'answer' && answerUnavailable
    setSearchMode(mode)
    setSearchDocumentId(documentId)
    const fallbackNotices = [
      scopeNeedsFallback
        ? scopedDocument
          ? '이 검색 기록의 문서는 아직 검색할 수 없어 전체 문서 범위로 다시 찾습니다.'
          : '이 검색 기록의 문서는 문서함에 없어 전체 문서 범위로 다시 찾습니다.'
        : '',
      modeNeedsFallback ? '의미 검색을 사용할 수 없어 정확한 단어로 찾습니다.' : '',
      answerNeedsFallback ? '답변 기능을 사용할 수 없어 근거 문서 검색으로 바꿉니다.' : '',
    ].filter(Boolean)
    if (fallbackNotices.length > 0) setNotice(fallbackNotices.join(' '))
    if (item.view === 'answer' && !answerNeedsFallback) void askFor(item.query, mode, documentId)
    else void searchFor(item.query, mode, documentId)
  }

  function editRecentSearch(item: RecentSearch) {
    const scopeNeedsFallback = recentSearchScopeNeedsFallback(item)
    openQuestionDraft(item.query, scopeNeedsFallback ? null : item.documentId, semanticSearchUnavailable ? 'keyword' : item.mode)
    if (scopeNeedsFallback) setNotice('기록에 연결된 문서를 사용할 수 없어 검색 범위를 전체 문서로 열었어요.')
  }

  function tryAboutExample() {
    const example = EXAMPLE_QUESTIONS[0]
    if (!example || busy || databaseUnavailable || !aboutExampleDocumentReady) return
    navigate('search')
    setSearchDocumentId(null)
    if (answerUnavailable) {
      setSearchMode('keyword')
      void searchFor(example.question, 'keyword', null)
    } else {
      void askFor(example.question, searchMode, null)
    }
  }

  function searchAllFromDocument(term: string) {
    const mode = semanticSearchUnavailable ? 'keyword' : searchMode
    if (semanticSearchUnavailable) setSearchMode('keyword')
    focusSearchAfterNavigation.current = true
    navigate('search', true)
    setSearchDocumentId(null)
    void searchFor(term, mode, null)
  }

  const historyEntryForRestore = readSearchHistoryEntry(window.history.state)
  const historyDocumentScopeAvailable = !historyEntryForRestore?.documentId || documents.some(doc =>
    doc.id === historyEntryForRestore.documentId && getDocumentLifecycle(doc.status, doc.index_status) === 'searchable',
  )
  const historyDatabaseAvailable = apiReachable !== false && ready?.database.available !== false
  const historySemanticSearchAvailable = apiReachable !== false && (!ready || ready.ollama.available && ready.models.embedding.functional)
  const historyAnswerAvailable = historySemanticSearchAvailable && (!ready || ready.models.chat.functional)

  useEffect(() => {
    const browserHistoryChanged = restoredHistoryRevisionRef.current !== historyRevision
    restoredHistoryRevisionRef.current = historyRevision
    if (page !== 'search') return
    const entry = readSearchHistoryEntry(window.history.state)
    if (!entry) {
      // A readiness refresh can also rerun this effect while the user is composing a question.
      if (!browserHistoryChanged) return
      setQuery('')
      setResultQuery('')
      setSearchMode('hybrid')
      setResultMode('hybrid')
      setResultView('results')
      setSearchDocumentId(null)
      setResultDocumentId(null)
      setResults([])
      setSearchMessage('')
      setSearchFailed(false)
      setChatResult(null)
      setChatError('')
      return
    }

    const restore = resolveSearchHistoryRestore(entry, {
      documentsReady: documentsLoaded && !documentsError,
      documentScopeAvailable: historyDocumentScopeAvailable,
      databaseAvailable: historyDatabaseAvailable,
      semanticSearchAvailable: historySemanticSearchAvailable,
      answerAvailable: historyAnswerAvailable,
    })
    const restoredEntry = restore.entry
    const sameVisibleQuery = resultQuery === entry.query && resultView === restoredEntry.view && resultDocumentId === restoredEntry.documentId
    if (restore.notices.length === 0 && sameVisibleQuery && restoredEntry.view === 'answer' && chatResult) return
    if (restore.notices.length === 0 && sameVisibleQuery && restoredEntry.view === 'results' && resultMode === restoredEntry.mode && (results.length > 0 || searchMessage === '관련 내용을 찾지 못했어요.')) return

    setQuery(entry.query)
    setSearchMode(restoredEntry.mode)
    setSearchDocumentId(restoredEntry.documentId)
    setResultQuery(entry.query)
    setResultDocumentId(restoredEntry.documentId)
    setResultMode(restoredEntry.view === 'answer' ? 'vector' : restoredEntry.mode)
    setResultView(restoredEntry.view)
    if (restore.notices.length > 0) setNotice(restore.notices.join(' '))

    if (restore.status === 'waiting') {
      setResults([])
      setSearchMessage('')
      setSearchFailed(false)
      setChatResult(null)
      setChatError('')
      return
    }
    if (restoredEntry.view === 'answer') void askFor(entry.query, restoredEntry.mode, restoredEntry.documentId)
    else void searchFor(entry.query, restoredEntry.mode, restoredEntry.documentId)
  }, [historyRevision, documentsLoaded, documentsError, historyDocumentScopeAvailable, historyDatabaseAvailable, historySemanticSearchAvailable, historyAnswerAvailable])

  async function copyAnswer() {
    if (!chatResult || chatResult.abstained) return
    const answer = cleanAnswerText(chatResult.answer, resultQuery, chatResult.sources)
    try {
      const citations = chatResult.sources.map((source, index) => {
        const location = source.page_number ? `p. ${source.page_number}` : source.section_path || `구간 ${source.chunk_index + 1}`
        const link = `${window.location.origin}${documentUrl(source.document_id, source.chunk_index)}`
        const originalSource = savedSourceAvailability(source.document_id) === false ? '원문 문서: 삭제됨' : link
        return `${index + 1}. ${displayDocumentName(source.document_id, source.filename)} · ${location}\n   ${source.excerpt}\n   ${originalSource}`
      }).join('\n')
      await navigator.clipboard.writeText(citations ? `${answer}\n\n출처\n${citations}` : answer)
      setCopyMessage('답변을 복사했습니다.')
      window.setTimeout(() => setCopyMessage(''), 2200)
    } catch { setCopyMessage('이 브라우저에서는 복사할 수 없습니다.') }
  }

  async function copySource(source: SearchResult) {
    const location = source.page_number ? `p. ${source.page_number}` : source.section_path || `구간 ${source.chunk_index + 1}`
    const link = `${window.location.origin}${documentUrl(source.document_id, source.chunk_index)}`
    const originalSource = savedSourceAvailability(source.document_id) === false ? '원문 문서: 삭제됨' : link
    try {
      await navigator.clipboard.writeText(`${displayDocumentName(source.document_id, source.filename)} · ${location}\n${source.excerpt}\n${originalSource}`)
      setSourceCopyMessage({ id: source.chunk_id, message: '출처와 발췌를 복사했습니다.' })
    } catch {
      setSourceCopyMessage({ id: source.chunk_id, message: '이 브라우저에서는 복사할 수 없습니다.' })
    }
    window.setTimeout(() => setSourceCopyMessage(current => current?.id === source.chunk_id ? null : current), 2400)
  }

  const databaseUnavailable = apiReachable === false || !!ready && !ready.database.available
  const semanticSearchUnavailable = apiReachable === false || !!ready && (!ready.ollama.available || !ready.models.embedding.functional)
  const answerUnavailable = semanticSearchUnavailable || !!ready && !ready.models.chat.functional
  const setupRequired = apiReachable === false || !!ready && (
    !ready.database.available || !ready.ollama.available || !ready.models.chat.functional || !ready.models.embedding.functional
  )
  const isEmptyDocumentsLoadError = page === 'search' && !!documentsError && documents.length === 0 && !setupRequired
  useEffect(() => {
    const wasEmptyDocumentsLoadError = emptyDocumentsLoadErrorRef.current
    emptyDocumentsLoadErrorRef.current = isEmptyDocumentsLoadError
    if (!wasEmptyDocumentsLoadError || isEmptyDocumentsLoadError || page !== 'search') return
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('#page-content h1')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isEmptyDocumentsLoadError, page])
  useEffect(() => {
    if (!restoreSearchHeadingAfterRefreshRef.current) return
    if (page !== 'search') {
      restoreSearchHeadingAfterRefreshRef.current = false
      return
    }
    if (documentsRefreshing) return
    if (documentsError) {
      restoreSearchHeadingAfterRefreshRef.current = false
      return
    }
    restoreSearchHeadingAfterRefreshRef.current = false
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('#page-content h1')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [documentsError, documentsRefreshing, page])
  const setupTitle = databaseUnavailable ? '문서 검색을 사용할 수 없어요.' : '일부 기능을 사용할 수 없어요.'
  const setupMessage = apiReachable === false
    ? '문서 검색을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'
    : ready && !ready.database.available
      ? '문서함을 잠시 사용할 수 없어요. 조금 뒤 다시 확인해 주세요.'
      : ready && !ready.ollama.available
        ? '지금은 문서에 적힌 단어 그대로 찾을 수 있어요. 비슷한 내용 찾기와 답변은 잠시 후 다시 이용해 주세요.'
        : ready && !ready.models.embedding.functional
          ? '지금은 문서에 적힌 단어 그대로 찾을 수 있어요. 비슷한 내용 찾기와 답변은 잠시 후 다시 이용해 주세요.'
          : ready && !ready.models.chat.functional
            ? '문서 검색은 계속 이용할 수 있어요. 답변 기능은 잠시 후 다시 이용해 주세요.'
            : '문서 검색을 준비하고 있습니다. 잠시 뒤 다시 확인해 주세요.'
  const selectedSearchDocumentAvailable = canUseDocumentScope(searchDocumentId)
  const searchDisabled = busy || !query.trim() || databaseUnavailable || !selectedSearchDocumentAvailable || (searchMode !== 'keyword' && semanticSearchUnavailable)
  const answerDisabled = busy || !query.trim() || databaseUnavailable || !selectedSearchDocumentAvailable || answerUnavailable
  const alternativeSearchMode: SearchMode | null = semanticSearchUnavailable
    ? resultMode === 'keyword' ? null : 'keyword'
    : resultMode === 'hybrid' ? 'keyword' : 'hybrid'
  const alternativeSearchLabel = alternativeSearchMode === 'keyword'
    ? '정확한 단어로만 찾기'
    : resultMode === 'vector' ? '단어까지 함께 찾기' : '비슷한 내용까지 함께 찾기'
  const favoriteIds = new Set(favoriteDocumentIds)
  const favoriteDocuments = documents.filter(doc => favoriteIds.has(doc.id))
  const recentlyOpenedDocuments = recentDocumentIds
    .map(id => documents.find(doc => doc.id === id))
    .filter((doc): doc is Doc => !!doc)
  const workspaceRecentDocuments = selectWorkspaceRecentDocuments(documents, searchDocumentId, recentDocumentIds, favoriteDocumentIds, 6)
  const visibleWorkspaceRecentDocuments = workspaceRecentDocuments.slice(0, 6)
  const workspaceRecentTotal = documents.filter(doc => !favoriteIds.has(doc.id) || doc.id === searchDocumentId).length
  const workspaceChunkCount = countSearchableDocumentChunks(documents)
  const workspaceFavoriteDocuments = favoriteDocuments
    .filter(doc => !visibleWorkspaceRecentDocuments.some(recent => recent.id === doc.id))
    .slice(0, 2)
  const homeRecentDocuments = selectRecentHomeDocuments(documents, recentDocumentIds, favoriteDocumentIds, 3)
  const detailRelatedDocuments = selectedDocument
    ? selectRelatedDocuments(documents, recentDocumentIds, selectedDocument.id, 3)
    : []
  const searchableDocuments = documents.filter(doc => getDocumentLifecycle(doc.status, doc.index_status) === 'searchable')
  const searchableDocumentsById = new Map(searchableDocuments.map(doc => [doc.id, doc]))
  const activitySuggestedDocuments = [
    ...recentDocumentIds.map(id => searchableDocumentsById.get(id)).filter((doc): doc is Doc => !!doc),
    ...[...searchableDocuments].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)),
  ].filter((doc, index, candidates) => candidates.findIndex(candidate => candidate.id === doc.id) === index).slice(0, 3)
  const processingDocumentCount = documents.filter(doc => getDocumentLifecycle(doc.status, doc.index_status) === 'processing').length
  const attentionDocumentCount = documents.filter(doc => {
    const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
    return lifecycle === 'extract_failed' || lifecycle === 'index_failed'
  }).length
  useEffect(() => {
    if (processingDocumentCount === 0) return
    let refreshing = false
    const refreshWhileVisible = async () => {
      if (document.visibilityState !== 'visible' || refreshing) return
      refreshing = true
      try {
        await refreshDocuments()
      } finally {
        refreshing = false
      }
    }
    const timer = window.setInterval(() => void refreshWhileVisible(), 5000)
    document.addEventListener('visibilitychange', refreshWhileVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhileVisible)
    }
  }, [processingDocumentCount, refreshDocuments])
  const selectedSearchDocument = documents.find(doc => doc.id === searchDocumentId)
  const selectedSearchDocumentLifecycle = selectedSearchDocument
    ? getDocumentLifecycle(selectedSearchDocument.status, selectedSearchDocument.index_status)
    : null
  const selectedSearchDocumentMessage = !selectedSearchDocument
    ? '문서함에서 다시 선택해 주세요.'
    : selectedSearchDocumentLifecycle === 'processing'
      ? '이 문서의 처리가 끝나면 검색할 수 있습니다.'
      : selectedSearchDocumentLifecycle === 'extract_failed'
        ? '파일을 읽지 못했어요. 내 문서 목록에서 다시 읽기를 눌러 보세요.'
        : '검색 준비에 실패했어요. 내 문서 목록에서 다시 처리할 수 있습니다.'
  const resultScopeLabel = resultDocumentId
    ? `선택 문서 · ${documents.find(doc => doc.id === resultDocumentId)?.filename ?? '문서함에서 확인 필요'}`
    : '전체 문서'
  const searchDraftChanged = Boolean(resultQuery && (
    query.trim() !== resultQuery || searchDocumentId !== resultDocumentId || resultView === 'results' && searchMode !== resultMode
  ))
  const searchScopeDescription = resultQuery
    ? searchDraftChanged ? '다음 검색에 선택한 범위를 사용합니다.' : '범위를 바꾸면 표시된 질문을 다시 찾습니다.'
    : selectedSearchDocument && selectedSearchDocumentLifecycle === 'searchable'
      ? `${selectedSearchDocument.filename} · 검색 구간 ${selectedSearchDocument.chunk_count}개에서 찾습니다.`
      : selectedSearchDocument
        ? selectedSearchDocumentMessage
      : searchDocumentId
        ? '이전에 선택한 문서를 확인해 주세요.'
        : '모든 검색 가능한 문서에서 찾습니다.'
  const hasDocumentWorkspace = documentsLoaded && !documentsError && documents.length > 0
  const workspaceContextDocuments = selectWorkspaceContextDocuments(
    selectedSearchDocument ?? null,
    visibleWorkspaceRecentDocuments,
    workspaceFavoriteDocuments,
  )
  const workspaceOutlineDocuments = selectedSearchDocument && !workspaceContextDocuments.some(doc => doc.id === selectedSearchDocument.id)
    ? [...workspaceContextDocuments, selectedSearchDocument]
    : workspaceContextDocuments
  const hasWorkspaceTopics = workspaceContextDocuments.some(doc => (workspaceOutlines[doc.id]?.sections.length ?? 0) > 0)
  const shouldAutoOpenSearchTopics = page === 'search'
    && hasWorkspaceTopics
    && recentSearches.length === 0
    && savedEvidence.length === 0
  const workspaceContextSignature = workspaceOutlineDocuments
    .map(doc => `${doc.id}:${doc.status}:${doc.index_status}:${doc.chunk_count}`)
    .join('|')

  useEffect(() => {
    if (page === 'search' && !searchTopicsTouched) setSearchTopicsOpen(shouldAutoOpenSearchTopics)
  }, [page, shouldAutoOpenSearchTopics, searchTopicsTouched])

  useEffect(() => {
    if ((page !== 'search' && page !== 'documents') || !hasDocumentWorkspace || workspaceOutlineDocuments.length === 0) return
    const pendingDocuments = workspaceOutlineDocuments.filter(doc => workspaceOutlines[doc.id]?.chunk_count !== doc.chunk_count)
    if (pendingDocuments.length === 0) return

    const controller = new AbortController()
    let active = true
    void Promise.all(pendingDocuments.map(async doc => {
      try {
        const response = await fetch(`${API}/api/documents/${doc.id}/outline`, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(`문서 목차를 불러오지 못했습니다. (${response.status})`)
        const payload = await response.json()
        if (!payload || !Array.isArray(payload.sections)) throw new Error('문서 목차 응답이 올바르지 않습니다.')
        const outline: DocOutline = {
          document_id: doc.id,
          filename: doc.filename,
          chunk_count: Number.isFinite(payload?.chunk_count) ? payload.chunk_count : doc.chunk_count,
          preview: typeof payload?.preview === 'string' ? payload.preview.slice(0, 240) : '',
          sections: Array.isArray(payload?.sections)
            ? payload.sections.filter((section: unknown): section is { title: string; chunk_count: number; first_chunk_index: number } =>
              !!section && typeof section === 'object' &&
              typeof (section as { title?: unknown }).title === 'string' &&
              Number.isFinite((section as { chunk_count?: unknown }).chunk_count) &&
              Number.isFinite((section as { first_chunk_index?: unknown }).first_chunk_index),
            )
            : [],
          more_sections: Number.isFinite(payload?.more_sections) ? payload.more_sections : 0,
        }
        return [doc.id, outline] as const
      } catch {
        return [doc.id, { document_id: doc.id, filename: doc.filename, chunk_count: doc.chunk_count, sections: [], more_sections: 0, unavailable: true } satisfies DocOutline] as const
      }
    })).then(entries => {
      if (!active) return
      setWorkspaceOutlines(current => ({ ...current, ...Object.fromEntries(entries) }))
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [page, hasDocumentWorkspace, workspaceContextSignature, workspaceOutlines])

  function retryWorkspaceOutline(documentId: string) {
    setWorkspaceOutlines(current => {
      if (!current[documentId]?.unavailable) return current
      const next = { ...current }
      delete next[documentId]
      return next
    })
  }

  const recentQuestionKeys = new Set(recentSearches.map(item => normalizeQuestionForComparison(item.query)))
  const hasCompleteExampleCorpus = documents.length === EXAMPLE_CORPUS_FILES.length && EXAMPLE_CORPUS_FILES.every(filename => documents.some(doc =>
    doc.filename === filename && doc.status === 'completed' && doc.index_status === 'ready',
  ))
  const aboutExampleDocumentReady = documents.some(doc =>
    doc.filename === EXAMPLE_QUESTIONS[0].filenames[0] && doc.status === 'completed' && doc.index_status === 'ready',
  )
  const availableExampleQuestions = EXAMPLE_QUESTIONS.filter(example => hasCompleteExampleCorpus &&
    !recentQuestionKeys.has(normalizeQuestionForComparison(example.question)) &&
    example.filenames.every(filename => documents.some(doc =>
      doc.filename === filename && doc.status === 'completed' && doc.index_status === 'ready',
    )),
  )
  const documentQuestionStarters: QuestionStarter[] = workspaceOutlineDocuments
    .filter(doc => getDocumentLifecycle(doc.status, doc.index_status) === 'searchable')
    .flatMap(doc => (workspaceOutlines[doc.id]?.sections ?? []).map(section => ({
      label: searchScopeDocumentLabel(doc),
      question: `“${section.title}”의 핵심 내용과 근거를 알려줘.`,
      directAnswer: false,
      document: doc,
    })))
    .filter(example => !recentQuestionKeys.has(normalizeQuestionForComparison(example.question)))
    .slice(0, 3)
  const questionStarters: QuestionStarter[] = hasCompleteExampleCorpus && availableExampleQuestions.length > 0
    ? availableExampleQuestions
    : searchableDocuments.length > 0
      ? documentQuestionStarters.length > 0
        ? documentQuestionStarters
        : GENERAL_QUESTION_STARTERS.filter(example => !recentQuestionKeys.has(normalizeQuestionForComparison(example.question)))
      : []
  const questionStartersFromDocumentTopics = documentQuestionStarters.length > 0
    && !(hasCompleteExampleCorpus && availableExampleQuestions.length > 0)
  const recentSearchEntries = recentSearches
    .filter(item => !resultQuery || normalizeRecentSearchKey(item.query) !== normalizeRecentSearchKey(resultQuery) || item.documentId !== resultDocumentId)
    .map(item => ({
      ...item,
      scopeLabel: recentSearchScopeLabel(item),
    }))
  const visibleRecentSearches = recentSearchEntries.slice(0, 5)
  const draftRecentSearches = recentSearchEntries
    .filter(item => !searchDocumentId || item.documentId === searchDocumentId).slice(0, 3)
  const draftSavedEvidence = searchDocumentId ? savedEvidence.filter(item => item.document_id === searchDocumentId) : savedEvidence
  const showingSearchRecovery = Boolean(resultQuery && (
    (searchMessage === '관련 내용을 찾지 못했어요.' && !chatResult && !searchFailed) || chatResult?.abstained
  ))
  const matchesDocumentName = createTextQueryMatcher(documentFilter)
  const filteredDocuments = documents
    .filter(doc => matchesDocumentName([doc.filename]))
    .filter(doc => fileTypeFilter === 'all' || doc.file_type.toLowerCase() === fileTypeFilter)
    .filter(doc => {
      const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
      return documentStatusFilter === 'all'
        || documentStatusFilter === 'extract_failed' && lifecycle === 'extract_failed'
        || documentStatusFilter === 'index_failed' && lifecycle === 'index_failed'
        || documentStatusFilter === 'attention' && (lifecycle === 'extract_failed' || lifecycle === 'index_failed')
        || documentStatusFilter === 'searchable' && lifecycle === 'searchable'
        || documentStatusFilter === 'processing' && lifecycle === 'processing'
    })
    .sort((a, b) => documentSort === 'name'
      ? a.filename.localeCompare(b.filename, 'ko')
      : documentSort === 'oldest'
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const renderWorkspaceDocument = (doc: Doc) => {
    const lifecycle = getDocumentLifecycle(doc.status, doc.index_status)
    const status = lifecycle === 'extract_failed' ? '읽기 실패' : lifecycle === 'index_failed' ? '다시 처리 필요' : lifecycle === 'searchable' ? '검색 가능' : doc.status === 'processing' ? '파일 읽는 중' : '처리 중'
    const workspaceDocumentSummary = getDocumentChunkSummary(doc)
    const statusKind = lifecycle === 'extract_failed' || lifecycle === 'index_failed' ? 'failed' : lifecycle === 'searchable' ? 'ready' : 'pending'
    const isFavorite = favoriteIds.has(doc.id)
    const isSearchScope = doc.id === searchDocumentId
    return <li key={doc.id}>
      <div className="workspace-doc-entry">
        <a
          className="workspace-doc-item"
          id={`workspace-doc-${doc.id}`}
          href={documentUrl(doc.id)}
          onClick={event => {
            if (isPlainLeftClick(event)) {
              event.preventDefault()
              void openDocument(doc)
            }
          }}
          title={doc.filename}
        >
          <span className={`workspace-file-icon file-${doc.file_type}`}><FileText size={16}/></span>
          <span className="workspace-doc-copy"><strong>{doc.filename}</strong><small>{new Date(doc.created_at).toLocaleDateString('ko-KR')} · {workspaceDocumentSummary}</small></span>
          <span className={`workspace-doc-status ${statusKind}`}>{status}</span>
        </a>
        {lifecycle === 'searchable' ? <button
          className={`workspace-doc-ask${isSearchScope ? ' active' : ''}`}
          type="button"
          aria-label={isSearchScope ? `${doc.filename} 현재 질문 범위` : `${doc.filename}에서 질문하기`}
          aria-pressed={isSearchScope}
          title={isSearchScope ? '현재 질문 범위 · 질문 입력란으로 이동' : '이 문서를 검색 범위로 설정하고 질문하기'}
          onClick={() => askAboutWorkspaceDocument(doc)}
        ><Search size={14}/></button> : lifecycle === 'extract_failed' || lifecycle === 'index_failed' ? <button
          className="workspace-doc-ask workspace-doc-retry"
          type="button"
          disabled={busy}
          aria-label={lifecycle === 'extract_failed' ? `${doc.filename} 다시 읽기` : `${doc.filename} 검색 준비 다시 처리`}
          title={lifecycle === 'extract_failed' ? '보관된 원본 파일에서 다시 읽기' : '검색 인덱스 다시 만들기'}
          onClick={event => {
            if (event.detail === 0) event.currentTarget.closest('.workspace-doc-entry')?.querySelector<HTMLAnchorElement>('.workspace-doc-item')?.focus({ preventScroll: true })
            if (lifecycle === 'extract_failed') void retryDocumentExtraction(doc)
            else void indexDocument(doc)
          }}
        ><RefreshCw size={14}/></button> : null}
        <button
          className={`workspace-favorite-toggle ${isFavorite ? 'active' : ''}`}
          id={`workspace-favorite-${doc.id}`}
          type="button"
          aria-label={isFavorite ? `${doc.filename} 즐겨찾기 해제` : `${doc.filename} 즐겨찾기 추가`}
          aria-pressed={isFavorite}
          title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          onClick={() => toggleWorkspaceFavorite(doc.id)}
        ><Star size={14} fill={isFavorite ? 'currentColor' : 'none'} /></button>
      </div>
    </li>
  }

  const searchNavigationActive = page === 'search' || page === 'detail' && documentReturnPageRef.current === 'search'
  const documentsNavigationActive = page === 'documents' || page === 'detail' && documentReturnPageRef.current === 'documents'
  const favoritesNavigationActive = page === 'favorites' || page === 'detail' && documentReturnPageRef.current === 'favorites'
  const moreMenuPageLabel = page === 'saved' || page === 'detail' && documentReturnPageRef.current === 'saved'
    ? '저장한 근거'
    : page === 'activity'
      ? '검색 기록'
      : page === 'guide'
        ? '사용 안내'
        : page === 'about'
          ? '프로젝트 소개'
          : null

  return <div className="app-shell">
    <a className="skip-link" href="#page-content">본문으로 바로가기</a>
    <header className="topbar">
      <a className="brand" href="/" aria-label="문서담 홈"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path className="brand-sheet-back" d="M8.5 11h15l6 6v16H8.5z"/><path className="brand-sheet-front" d="M13 7h11l7 7v18H13z"/><path className="brand-fold" d="M24 7v7h7"/><path className="brand-lines" d="M17 20h10M17 24h10M17 28h6"/></svg></span><span className="brand-name">문서담 <small>사내 자료실</small></span></a>
      <nav className="main-nav" aria-label="주 메뉴">
        <a href="/" className={searchNavigationActive ? 'active' : ''} aria-current={searchNavigationActive ? 'page' : undefined} onClick={event => { if (isPlainLeftClick(event)) { event.preventDefault(); navigate('search') } }}>문서 검색</a>
        <a href="/documents" className={documentsNavigationActive ? 'active' : ''} aria-current={documentsNavigationActive ? 'page' : undefined} onClick={event => { if (isPlainLeftClick(event)) { event.preventDefault(); navigate('documents') } }}>내 문서 <span>{documents.length}</span></a>
        <a href="/favorites" className={favoritesNavigationActive ? 'active' : ''} aria-current={favoritesNavigationActive ? 'page' : undefined} onClick={event => { if (isPlainLeftClick(event)) { event.preventDefault(); navigate('favorites') } }}>즐겨찾기</a>
        <a href="/saved" className={`mobile-nav-overflow-link ${page === 'saved' || page === 'detail' && documentReturnPageRef.current === 'saved' ? 'active' : ''}`} aria-current={page === 'saved' || page === 'detail' && documentReturnPageRef.current === 'saved' ? 'page' : undefined} title="저장한 근거" onClick={event => { if (isPlainLeftClick(event)) { event.preventDefault(); navigate('saved') } }}><Bookmark size={14}/> 저장 근거{savedEvidence.length > 0 && <span className="nav-saved-count">{savedEvidence.length > 99 ? '99+' : savedEvidence.length}</span>}</a>
        <a href="/activity" className={`mobile-nav-overflow-link ${page === 'activity' ? 'active' : ''}`} aria-current={page === 'activity' ? 'page' : undefined} onClick={event => { if (isPlainLeftClick(event)) { event.preventDefault(); navigate('activity') } }}><HistoryIcon size={14}/> 검색 기록</a>
        <details ref={mobileNavMoreRef} className={`mobile-nav-more${moreMenuPageLabel ? ' active' : ''}`}>
          <summary aria-label={moreMenuPageLabel ? `더보기 메뉴, 현재 ${moreMenuPageLabel}` : '더보기 메뉴'}><MoreHorizontal size={15}/><span>더보기</span>{savedEvidence.length > 0 && <span className="mobile-nav-more-count">{savedEvidence.length > 99 ? '99+' : savedEvidence.length}</span>}</summary>
          <div className="mobile-nav-more-menu" onClick={event => {
            const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-page]')
            if (!anchor || !isPlainLeftClick(event)) return
            const destination = anchor.dataset.page as Exclude<AppPage, 'detail'> | undefined
            if (!destination) return
            event.preventDefault()
            navigate(destination)
            event.currentTarget.closest('details')?.removeAttribute('open')
          }}>
            <a href="/saved" data-page="saved" aria-current={page === 'saved' || page === 'detail' && documentReturnPageRef.current === 'saved' ? 'page' : undefined}><Bookmark size={14}/> 저장한 근거{savedEvidence.length > 0 && <span>{savedEvidence.length > 99 ? '99+' : savedEvidence.length}</span>}</a>
            <a href="/activity" data-page="activity" aria-current={page === 'activity' ? 'page' : undefined}><HistoryIcon size={14}/> 검색 기록</a>
            <a href="/guide" data-page="guide" aria-current={page === 'guide' ? 'page' : undefined}><BookOpen size={14}/> 사용 안내</a>
            <a href="/about" data-page="about" aria-current={page === 'about' ? 'page' : undefined}><Info size={14}/> 프로젝트 소개</a>
          </div>
        </details>
      </nav>
      {page !== 'documents' && page !== 'detail' && page !== 'account' && !(page === 'search' && documentsLoaded && !documentsError && documents.length === 0) && <button className="header-add-button" type="button" aria-label="문서 추가" title="문서 추가" disabled={busy} onClick={() => inputRef.current?.click()}><FileUp size={15} /> 문서 추가</button>}
      <button className="account-control" type="button" onClick={() => navigate('account')} aria-label={`${user.display_name} 계정 관리`}><span className="account-avatar" aria-hidden="true">{user.display_name.slice(0, 1)}</span><span className="account-name">{user.display_name}</span><UserRound size={15}/></button>
    </header>
    {recentSearchUndo?.userId === user.id && <div className="history-undo-notice">
      <span role="status" aria-live="polite">검색 기록 {recentSearchUndo.items.length}개를 지웠어요.</span>
      <button type="button" onClick={restoreRecentSearches}><RotateCcw size={13} aria-hidden="true"/> 실행 취소</button>
    </div>}
    {page !== 'documents' && uploadProgress && (
      <div className="global-upload-progress" role="status" aria-live="polite">
        <RefreshCw size={15} />
        <span>{uploadProgress.total > 1 ? `파일 ${uploadProgress.current} / ${uploadProgress.total} 처리 중` : '파일 처리 중'} · {uploadProgress.filename} <span aria-hidden="true">· {Math.floor(uploadProgress.elapsedSeconds / 60)}:{String(uploadProgress.elapsedSeconds % 60).padStart(2, '0')}</span></span>
      </div>
    )}
    {page !== 'documents' && page !== 'detail' && notice && (
      <div className="notice global-notice">
        <span className="notice-message" role="status" aria-live="polite">{notice}</span>
        {uploadedDocumentsSearchable && <button className="notice-action" onClick={() => {
          setNotice('')
          if (page === 'search') searchInputRef.current?.focus()
          else {
            focusSearchAfterNavigation.current = true
            navigate('search')
          }
        }}><Search size={13} /> 문서 검색하기</button>}
      </div>
    )}
    <main id="page-content" tabIndex={-1}>

    {page === 'search' && <div className={`workspace-layout ${hasDocumentWorkspace ? 'with-documents' : ''}`}>
    {hasDocumentWorkspace && <>
      <div className="workspace-mobile-tabs" role="group" aria-label="검색 화면 바로가기">
        <button type="button" aria-pressed={workspacePane === 'search'} aria-controls="workspace-search-panel" onClick={() => setWorkspacePane('search')}><Search size={15}/> 질문하기</button>
        <button type="button" aria-pressed={workspacePane === 'documents'} aria-controls="workspace-documents-panel" onClick={() => setWorkspacePane('documents')}><FileText size={15}/> 문서 바로가기 <span>{documents.length}</span></button>
      </div>
      <aside id="workspace-documents-panel" className={`workspace-docs-pane ${workspacePane === 'documents' ? 'mobile-active' : ''}`} aria-label="검색 작업 공간의 내 문서">
        <div className="workspace-pane-heading">
          <div><span className="section-overline">자료실</span><h2 tabIndex={-1}>문서 바로가기 <span>{documents.length}</span></h2></div>
          <button className="workspace-upload-icon" type="button" disabled={busy} aria-label="문서 추가" title="문서 추가" onClick={() => inputRef.current?.click()}><FileUp size={17}/></button>
        </div>
        {visibleWorkspaceRecentDocuments.length > 0 && <>
          <p className="workspace-pane-caption" aria-live="polite">{selectedSearchDocument ? '질문 범위와 최근 문서' : recentlyOpenedDocuments.length > 0 ? '최근 문서' : '최근 추가한 문서'}{workspaceRecentTotal > 6 ? ' · 6개 표시' : ''}</p>
          <ul className="workspace-doc-list">
            {visibleWorkspaceRecentDocuments.map(renderWorkspaceDocument)}
          </ul>
          {visibleWorkspaceRecentDocuments.some(doc => getDocumentLifecycle(doc.status, doc.index_status) === 'searchable') && <p className="workspace-quick-ask-hint"><Search size={12} aria-hidden="true" /> 돋보기 버튼을 누르면 해당 문서만 질문 범위로 지정됩니다.</p>}
        </>}
        <WorkspaceDocumentTopics
          documents={workspaceContextDocuments}
          outlines={workspaceOutlines}
          busy={busy}
          selectedDocumentId={selectedSearchDocument?.id ?? null}
          onRetryOutline={retryWorkspaceOutline}
          onOpenDocument={doc => { void openDocument(doc) }}
          onAskAboutDocument={askAboutWorkspaceDocument}
        />
        {workspaceFavoriteDocuments.length > 0 && <section className="workspace-favorites" aria-label="즐겨찾는 문서">
          <p><Star size={13} fill="currentColor" /> 즐겨찾기</p>
          <ul className="workspace-doc-list">{workspaceFavoriteDocuments.map(renderWorkspaceDocument)}</ul>
        </section>}
        <div className="workspace-scope">
          <span className="workspace-scope-icon"><Search size={15}/></span>
          <span className="workspace-scope-copy"><strong>검색 범위</strong><small title={selectedSearchDocument ? `${selectedSearchDocument.filename} · 검색 구간 ${selectedSearchDocument.chunk_count}개` : `전체 ${searchableDocuments.length}개 문서 · 검색 구간 ${workspaceChunkCount}개`}>{selectedSearchDocument ? `${selectedSearchDocument.filename} · 검색 구간 ${selectedSearchDocument.chunk_count}개` : `전체 ${searchableDocuments.length}개 문서 · 검색 구간 ${workspaceChunkCount}개`}</small></span>
        </div>
        {attentionDocumentCount > 0 && searchableDocuments.length > 0 && <button className="workspace-issues-link" type="button" onClick={() => {
          setDocumentFilter('')
          setFileTypeFilter('all')
          setDocumentStatusFilter('attention')
          setDocumentSort('newest')
          setDocumentFavoritesOnly(false)
          setDocumentLibraryPage(1)
          navigate('documents')
        }}>
          <AlertCircle size={15} aria-hidden="true" />
          <span><strong>확인할 문서 {attentionDocumentCount}개</strong><small>파일 읽기나 검색 준비에 문제가 있어요.</small></span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>}
        <div className="workspace-pane-footer">
          {recentlyOpenedDocuments.length > 0 && <button type="button" className="plain-link clear-recent-documents" title="검색 기록은 유지하고 최근 열어본 문서 목록만 지웁니다." onClick={() => setRecentDocumentIds([])}>최근 문서 지우기</button>}
          <button type="button" className="plain-link" onClick={() => navigate('documents')}>문서함 모두 보기 <ChevronRight size={14}/></button>
        </div>
        <p className="workspace-storage-note">PDF · DOCX · TXT · 파일당 20MB</p>
      </aside>
    </>}
    <div id="workspace-search-panel" className={`workspace-main-pane${!hasDocumentWorkspace || workspacePane === 'search' ? ' mobile-active' : ''}${resultQuery ? ' has-submitted-search' : ''}`}>
    {!(documentsLoaded && !documentsError && documents.length === 0) && !(documentsError && !setupRequired && documents.length === 0) && <section className="search-home" id="search">
      <div className={`page-intro${resultQuery ? ' search-intro-compact' : ''}`}>
        {!resultQuery && <span className="page-kicker">문서 검색</span>}
        <h1 tabIndex={-1}>{resultQuery ? '문서 검색' : <>문서에서 원하는 내용을<br className="search-desktop-break" /> 찾아보세요.</>}</h1>
        {resultQuery
          ? <button className="new-question-button" type="button" disabled={busy} onClick={startNewQuestion}><Plus size={15} aria-hidden="true" /> 새 질문</button>
          : <p>찾은 문장과 원문 위치를 함께 보여드립니다.</p>}
      </div>
      <form className="search-form" role="search" aria-label="문서 검색" onSubmit={search}>
        <div className="search-input-row">
          <Search size={20} />
          <input
            ref={searchInputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="검색어 입력"
            aria-label="문서 검색"
            aria-keyshortcuts="Control+K Meta+K"
            maxLength={2000}
          />
          {query && (
            <button
              className="search-clear"
              type="button"
              aria-label="검색어 지우기"
              onClick={() => { setQuery(''); searchInputRef.current?.focus() }}
            >
              <X size={14} />
            </button>
          )}
          <select
            value={searchMode}
            onChange={event => setSearchMode(event.target.value as 'vector' | 'keyword' | 'hybrid')}
            aria-label="검색 방식"
          >
            <option value="hybrid" disabled={semanticSearchUnavailable}>함께 찾기</option>
            <option value="vector" disabled={semanticSearchUnavailable}>비슷한 내용</option>
            <option value="keyword" disabled={databaseUnavailable}>정확한 단어</option>
          </select>
        </div>
        <div className="search-actions">
          <div className="search-form-options">
            {documents.length > 0 && <>
              <label className="search-scope-field" htmlFor="search-document-scope">
                <span>검색 범위</span>
                <select id="search-document-scope" value={searchDocumentId ?? ''} disabled={busy}
                  aria-describedby="search-scope-description" title={searchScopeDescription}
                  onChange={event => changeSearchScope(event.target.value || null)}>
                  <option value="">전체 문서 · {searchableDocuments.length}</option>
                  {searchDocumentId && !searchableDocuments.some(doc => doc.id === searchDocumentId) && <option value={searchDocumentId}>
                    {selectedSearchDocument ? `${searchScopeDocumentLabel(selectedSearchDocument)} · 확인 필요` : '이전에 선택한 문서 · 확인 필요'}
                  </option>}
                  {searchableDocuments.map(doc => <option key={doc.id} value={doc.id}>{searchScopeDocumentLabel(doc)}</option>)}
                </select>
              </label>
              <span id="search-scope-description" className="sr-only">{searchScopeDescription}</span>
            </>}
            <kbd className="search-keyboard-hint">{searchShortcutLabel}</kbd>
          </div>
          <div className="search-action-buttons">
            <button className="button-secondary" type="submit" disabled={searchDisabled}>
              {searchPending === 'search' ? '찾는 중…' : '검색'}
            </button>
            <button className="button-primary" type="button" disabled={answerDisabled} onClick={() => void ask()}>
              {searchPending === 'answer' ? '답변 만드는 중…' : '답변 보기'} <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </form>
      {setupRequired && <aside className="setup-note search-readiness-note"><div className="setup-copy" aria-live="polite"><strong>{setupTitle}</strong><span>{setupMessage}</span></div><div className="setup-actions">
        {!databaseUnavailable && semanticSearchUnavailable && searchMode !== 'keyword' && <button onClick={() => { setSearchMode('keyword'); searchInputRef.current?.focus() }}>정확한 단어로 찾기</button>}
        <button onClick={() => void refresh()}><RefreshCw size={14}/> 다시 시도</button>
      </div></aside>}
      {documents.length > 0 && searchableDocuments.length === 0 && <aside className="workspace-document-readiness">
        <AlertCircle size={16} aria-hidden="true" />
        <div aria-live="polite">
          <strong>{processingDocumentCount > 0 ? '문서 검색을 준비하고 있어요.' : '검색 가능한 문서가 없어요.'}</strong>
          <span>{processingDocumentCount > 0
            ? `${processingDocumentCount}개 처리 중${attentionDocumentCount > 0 ? ` · ${attentionDocumentCount}개 확인 필요` : ''}`
            : `${attentionDocumentCount}개 문서의 처리 상태를 확인해 주세요.`}</span>
        </div>
        <button type="button" onClick={() => navigate('documents')}>문서 상태 보기 <ArrowUpRight size={13} aria-hidden="true" /></button>
      </aside>}
      {searchDocumentId && documentsLoaded && !selectedSearchDocumentAvailable && searchableDocuments.length > 0 && <aside className="workspace-document-readiness">
        <AlertCircle size={16} aria-hidden="true" />
        <div aria-live="polite">
          <strong>선택한 문서는 아직 검색할 수 없어요.</strong>
          <span>{selectedSearchDocumentMessage}</span>
        </div>
        <button type="button" disabled={busy} onClick={() => changeSearchScope(null)}>전체 문서로 바꾸기 <ArrowUpRight size={13} aria-hidden="true" /></button>
      </aside>}
      {searchDraftChanged && <p className="search-draft-note" role="status">아래 결과는 마지막으로 실행한 질문과 설정을 보여줘요.</p>}
      {(!resultQuery || searchMode === 'keyword') && <p className="search-tip">{searchMode === 'keyword'
        ? '검색은 문서에 적힌 단어 그대로 찾고, 답변은 비슷한 내용에서 근거를 찾습니다.'
        : searchMode === 'hybrid'
          ? '문서에 적힌 단어와 비슷한 표현을 함께 검색합니다.'
          : '표현이 정확히 기억나지 않아도 질문해 보세요.'}</p>}
      {!resultQuery && selectedSearchDocument && selectedSearchDocumentAvailable && <SelectedDocumentContext
        document={selectedSearchDocument}
        documentName={searchScopeDocumentLabel(selectedSearchDocument)}
        outline={workspaceOutlines[selectedSearchDocument.id]}
        busy={busy}
        fallbackQuestions={SINGLE_DOCUMENT_QUESTION_STARTERS}
        onOpen={doc => { void openDocument(doc) }}
        onChooseQuestion={question => { setQuery(question); focusSearchInput() }}
        onRetryOutline={retryWorkspaceOutline}
      />}
      {!resultQuery && draftRecentSearches.length > 0 && <div className="search-history">
        <div className="search-history-heading">
          <span>{searchDocumentId ? '이 문서의 최근 검색' : '최근 검색'}</span>
          <div className="search-history-actions">
            <button type="button" className="view-search-history" aria-label="검색 기록 전체 보기" onClick={() => navigate('activity')}>모두 보기 <ArrowUpRight size={12} aria-hidden="true" /></button>
            {!searchDocumentId && <button type="button" aria-label="최근 검색 기록 모두 지우기" onClick={clearRecentSearchesAndFocusSearch}>기록 지우기</button>}
          </div>
        </div>
        <div className="history-chips">{draftRecentSearches.map(item => <button key={`${item.documentId ?? 'all'}:${item.mode}:${item.view}:${item.query}`} disabled={busy || !canRepeatRecentSearch(item)} title={!canRepeatRecentSearch(item) ? '문서 목록과 검색 기능을 확인한 뒤 다시 실행할 수 있어요.' : recentSearchScopeNeedsFallback(item) ? `${item.query} · 전체 문서 범위로 다시 찾습니다.` : item.query} onClick={() => repeatRecentSearch(item)}><span>{item.query}</span><small>{item.view === 'answer' ? '답변' : item.mode === 'vector' ? '비슷한 내용' : item.mode === 'keyword' ? '정확한 단어' : '함께 찾기'} · {item.scopeLabel}{recentSearchScopeNeedsFallback(item) && canRepeatRecentSearch(item) ? ' · 전체 문서로 다시 찾기' : ''}</small></button>)}</div>
      </div>}
      {!resultQuery && !searchDocumentId && questionStarters.length > 0 && <div className={`example-row question-shortcuts${questionStartersFromDocumentTopics ? ` document-topic-shortcuts${searchTopicsOpen ? ' topics-open' : ''}` : ''}`}><span>{questionStarters.every(example => example.directAnswer) ? '예시 질문' : questionStarters.some(example => example.document) ? '내 문서에서 이어서 질문' : '질문 예시 · 눌러서 입력'}</span>{questionStarters.map(example => <button key={`${example.document?.id ?? 'sample'}:${example.question}`} type="button" disabled={busy || databaseUnavailable} aria-label={`${example.directAnswer ? '바로 답변' : '질문 입력'} · ${example.label}: ${example.question}`} onClick={() => {
        if (!example.directAnswer) {
          if (example.document) askAboutWorkspaceDocument(example.document, example.question)
          else {
            setQuery(example.question)
            window.requestAnimationFrame(() => searchInputRef.current?.focus())
          }
        } else if (answerUnavailable) {
          setSearchMode('keyword')
          void searchFor(example.question, 'keyword')
        } else {
          void askFor(example.question)
        }
      }}><span className="question-shortcut-copy"><small>{example.label}</small><span>{example.question}</span></span>{example.directAnswer ? <ArrowUpRight size={12}/> : <ArrowDownLeft size={12}/>}</button>)}</div>}
      {!resultQuery && !searchDocumentId && <WorkspaceDocumentTopics
        documents={workspaceContextDocuments}
        outlines={workspaceOutlines}
        busy={busy}
        selectedDocumentId={selectedSearchDocument?.id ?? null}
        onRetryOutline={retryWorkspaceOutline}
        onOpenDocument={doc => { void openDocument(doc) }}
        onAskAboutDocument={askAboutWorkspaceDocument}
        className="workspace-search-mobile-topics"
        idPrefix="search"
        open={searchTopicsOpen}
        onOpenChange={open => {
          if (open !== searchTopicsOpen) {
            setSearchTopicsOpen(open)
            setSearchTopicsTouched(true)
          }
        }}
      />}
      {documents.length > 0 && !resultQuery && !searchDocumentId && recentSearches.length === 0 && <p className={`search-guidance ${hasWorkspaceTopics ? 'has-document-topics' : ''}`}>
        검색 결과의 출처를 누르면 해당 문서 구간으로 이동합니다.
      </p>}
      {!resultQuery && draftSavedEvidence.length > 0 && <RecentSavedEvidence
        items={draftSavedEvidence}
        documentNameFor={displayDocumentName}
        sourceAvailabilityFor={savedSourceAvailability}
        onOpen={openSource}
        onMore={() => navigate('saved')}
      />}
    </section>}

    {page === 'search' && !documentsLoaded && !documentsError && <div className="loading-note" role="status"><RefreshCw size={14} /> 문서함을 불러오고 있습니다…</div>}

    {page === 'search' && documentsError && !setupRequired && documents.length === 0 && <section className="documents-load-error-state" aria-labelledby="documents-load-error-title">
      <span className="documents-load-error-icon" aria-hidden="true"><AlertCircle size={20}/></span>
      <div>
        <span className="section-overline">자료실 연결</span>
        <h1 id="documents-load-error-title" tabIndex={-1}>문서함을 불러오지 못했어요.</h1>
        <p role="alert" aria-live="assertive">{documentsError}</p>
        <small>잠시 후 다시 불러오거나 사용 안내에서 문서 처리 방법을 확인할 수 있어요.</small>
        <div className="documents-load-error-actions">
          <button className="button-secondary" type="button" disabled={documentsRefreshing} onClick={() => void refreshDocuments()}><RefreshCw size={14} className={documentsRefreshing ? 'spin' : undefined}/> {documentsRefreshing ? '불러오는 중…' : '다시 시도'}</button>
          <button className="plain-link" type="button" onClick={() => navigate('guide')}>사용 안내 보기 <ArrowUpRight size={13}/></button>
        </div>
      </div>
    </section>}

    {page === 'search' && documentsError && !setupRequired && documents.length > 0 && <aside className="setup-note"><div className="setup-copy" role="alert" aria-live="assertive"><strong>문서 목록을 새로 확인하지 못했어요.</strong><span>{documentsError} 현재 불러온 문서는 계속 표시하고 있습니다.</span></div><button disabled={documentsRefreshing} onClick={event => { restoreSearchHeadingAfterRefreshRef.current = event.detail === 0; void refreshDocuments() }}><RefreshCw size={14} className={documentsRefreshing ? 'spin' : undefined}/> {documentsRefreshing ? '불러오는 중…' : '다시 시도'}</button></aside>}

    {page === 'search' && documentsLoaded && !documentsError && documents.length === 0 && <section
      className={`welcome-home ${draggingOverHomeUpload ? 'drag-over' : ''}`}
      onDragEnter={event => {
        event.preventDefault()
        if (Array.from(event.dataTransfer.types).includes('Files')) setDraggingOverHomeUpload(true)
      }}
      onDragLeave={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDraggingOverHomeUpload(false)
      }}
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault()
        setDraggingOverHomeUpload(false)
        void upload(event.dataTransfer.files)
      }}
    >
      {draggingOverHomeUpload && <div className="drop-overlay" role="status"><FileUp size={23} /><strong>{busy ? '지금 문서를 처리하고 있어요.' : '여기에 놓으면 문서를 추가합니다.'}</strong><span>{busy ? '작업이 끝난 뒤 다시 추가해 주세요.' : 'PDF · DOCX · TXT'}</span></div>}
      <div className="welcome-copy"><span className="welcome-eyebrow"><span /> 자료실이 비어 있어요</span><h1 tabIndex={-1}>사내 자료를<br />한곳에 모아보세요.</h1><p>파일을 추가하면 문서 속 문장까지 검색하고, 답변의 근거를 원문에서 확인할 수 있습니다.</p><div className="welcome-actions"><button className="button-primary" disabled={busy} onClick={() => inputRef.current?.click()}><FileUp size={16}/> 문서 올리기</button><button className="button-secondary" disabled={busy} onClick={() => void addDemoDocuments()}><BookOpen size={15}/> 예시 문서 3개 추가</button></div><div className="welcome-footnote"><ShieldCheck size={14} aria-hidden="true" /><span>문서 내용은 외부 AI 서비스로 보내지 않습니다.</span></div></div>
      <div className="welcome-upload" role="group" aria-label="문서 파일을 끌어 놓는 영역">
        <div className="welcome-upload-icon"><FileUp size={21} /></div>
        <strong>파일을 이곳에 끌어 놓으세요</strong>
        <span>파일 선택은 ‘문서 올리기’ 버튼을 이용해 주세요.</span>
        <small>PDF · DOCX · TXT <i /> 파일당 20MB 이하</small>
        <span className="welcome-upload-note">스캔 이미지 PDF의 글자 인식은 지원하지 않아요.</span>
      </div>
    </section>}

    {page === 'search' && <SearchResults
      recentSearches={showingSearchRecovery ? visibleRecentSearches : []}
      query={resultQuery || query}
      mode={resultMode}
      scopeLabel={resultScopeLabel}
      documentNameFor={displayDocumentName}
      sourceAvailabilityFor={savedSourceAvailability}
      onEditQuery={() => focusSearchInput(true)}
      isDocumentScoped={Boolean(resultDocumentId)}
      hasOtherSearchableDocuments={!!resultDocumentId && searchableDocuments.some(doc => doc.id !== resultDocumentId)}
      isEvidenceSaved={chunkId => savedEvidence.some(item => item.chunk_id === chunkId)}
      onToggleSavedEvidence={toggleSavedEvidence}
      searchMessage={searchMessage}
      requestFailed={searchFailed}
      results={results}
      chatResult={chatResult}
      answerStyle={answerStyle}
      onAnswerStyleChange={style => {
        if (style === answerStyle || busy) return
        setAnswerStyle(style)
        void askFor(resultQuery, searchMode, resultDocumentId, style)
      }}
      chatError={chatError}
      copyMessage={copyMessage}
      sourceCopyMessage={sourceCopyMessage}
      busy={searchPending !== null}
      answerPending={searchPending === 'answer'}
      canRepeatSearch={canRepeatRecentSearch}
      onSourceOpen={openSource}
      onCopySource={copySource}
      onSearchAll={term => searchAllFromDocument(term)}
      onBrowseDocuments={() => navigate('documents')}
      onRepeatSearch={repeatRecentSearch}
      onViewSearchHistory={() => navigate('activity')}
      onClearRecentSearches={clearRecentSearchesAndFocusSearch}
      onTryOtherSearchMode={() => {
        if (!alternativeSearchMode || busy) return
        setSearchMode(alternativeSearchMode)
        void searchFor(resultQuery, alternativeSearchMode, resultDocumentId)
      }}
      canTryOtherSearchMode={alternativeSearchMode !== null}
      alternativeSearchLabel={alternativeSearchLabel}
      onCopy={() => void copyAnswer()}
      onRetry={() => resultView === 'answer' ? void askFor(resultQuery, searchMode, resultDocumentId) : void searchFor(resultQuery, resultMode, resultDocumentId)}
    />}

    {page === 'search' && !hasDocumentWorkspace && favoriteDocuments.length > 0 && <section className="recent-section favorite-home-section">
      <div className="recent-heading"><div><span className="section-overline">즐겨찾기</span><h2>자주 찾는 문서</h2></div><button className="plain-link" onClick={() => navigate('favorites')}>모두 보기 <ChevronRight size={15}/></button></div>
      <div className="recent-list">{favoriteDocuments.slice(0, 3).map(doc => <a className="recent-item" id={`home-favorite-document-${doc.id}`} href={documentUrl(doc.id)} key={doc.id} onClick={event => {
        if (isPlainLeftClick(event)) { event.preventDefault(); void openDocument(doc) }
      }}><span className={`file-icon file-${doc.file_type}`}><FileText size={17}/></span><span className="recent-item-copy"><strong>{doc.filename}</strong><small>{new Date(doc.created_at).toLocaleDateString('ko-KR')} · {getDocumentChunkSummary(doc)}</small></span><ChevronRight size={16}/></a>)}</div>
    </section>}
    {page === 'search' && !hasDocumentWorkspace && homeRecentDocuments.length > 0 && <section className="recent-section">
      <div className="recent-heading"><div><span className="section-overline">자료실</span><h2>최근 문서</h2></div><button className="plain-link" onClick={() => navigate('documents')}>문서함 모두 보기 <ChevronRight size={15}/></button></div>
      <div className="recent-list">{homeRecentDocuments.map(doc => <a className="recent-item" id={`home-recent-document-${doc.id}`} href={documentUrl(doc.id)} key={doc.id} onClick={event => {
        if (isPlainLeftClick(event)) { event.preventDefault(); void openDocument(doc) }
      }}><span className={`file-icon file-${doc.file_type}`}><FileText size={17}/></span><span className="recent-item-copy"><strong>{doc.filename}</strong><small>{new Date(doc.created_at).toLocaleDateString('ko-KR')} · {getDocumentChunkSummary(doc)}</small></span><ChevronRight size={16}/></a>)}</div>
    </section>}
    </div>
    </div>}

    {page === 'documents' && <DocumentLibrary
      documents={documents}
      documentNameFor={searchScopeDocumentLabel}
      documentsLoaded={documentsLoaded}
      documentsRefreshing={documentsRefreshing}
      documentsError={documentsError}
      focusHeadingAfterDelete={focusDocumentHeading}
      onDeleteFocusHandled={() => setFocusDocumentHeading(false)}
      filteredDocuments={filteredDocuments}
      filenameFilter={documentFilter}
      favoriteDocumentIds={favoriteDocumentIds}
      fileTypeFilter={fileTypeFilter}
      statusFilter={documentStatusFilter}
      sortOrder={documentSort}
      favoritesOnly={documentFavoritesOnly}
      currentPage={documentLibraryPage}
      busy={busy}
      uploadProgress={uploadProgress}
      uploadedDocumentsSearchable={uploadedDocumentsSearchable}
      duplicateUploads={notice.includes('이미 등록되어 있어요') ? duplicateUploads : []}
      notice={notice}
      documentContext={!documentsError && workspaceContextDocuments.length > 0 && <WorkspaceDocumentContext
        documents={workspaceContextDocuments}
        outlines={workspaceOutlines}
        busy={busy}
        selectedDocumentId={selectedSearchDocument?.id ?? null}
        onOpenDocument={doc => { void openDocument(doc) }}
        onAskAboutDocument={askAboutWorkspaceDocument}
        onRetryOutline={retryWorkspaceOutline}
        overline="자료 둘러보기"
        title="문서 주제 미리보기"
        description="본문 일부를 읽거나, 주제를 골라 해당 문서에서 질문하세요."
        className="library-document-context"
      />}
      onFilenameFilterChange={setDocumentFilter}
      onToggleFavorite={toggleFavoriteDocument}
      onFileTypeFilterChange={setFileTypeFilter}
      onSortOrderChange={setDocumentSort}
      onStatusFilterChange={setDocumentStatusFilter}
      onFavoritesOnlyChange={setDocumentFavoritesOnly}
      onCurrentPageChange={setDocumentLibraryPage}
      onContinueToSearch={() => {
        focusSearchAfterNavigation.current = true
        navigate('search')
      }}
      onAskAboutDocument={doc => askAboutWorkspaceDocument(doc)}
      onResetFilters={() => { setDocumentFilter(''); setFileTypeFilter('all'); setDocumentStatusFilter('all'); setDocumentSort('newest'); setDocumentFavoritesOnly(false); setDocumentLibraryPage(1) }}
      onPickFiles={() => inputRef.current?.click()}
      onRefreshDocuments={() => { void refreshDocuments() }}
      onOpenDocument={doc => { void openDocument(doc) }}
      onDeleteDocument={doc => { void remove(doc) }}
      onDeleteSelectedDocuments={removeSelectedDocuments}
      onIndexDocument={doc => { void indexDocument(doc) }}
      onRetryExtraction={doc => { void retryDocumentExtraction(doc) }}
      onOpenDuplicateDocument={openDuplicateDocument}
      onUploadFiles={files => { void upload(files) }}
      onAddDemoDocuments={() => { void addDemoDocuments() }}
      recentSearches={recentSearches.map(item => ({
        ...item,
        scopeLabel: recentSearchScopeLabel(item),
      }))}
      canRepeatSearch={canRepeatRecentSearch}
      onRepeatSearch={item => {
        navigate('search', false, null)
        repeatRecentSearch(item)
      }}
      onViewSearchHistory={() => navigate('activity')}
      onClearRecentSearches={clearRecentSearches}
    />}

    {page === 'detail' && <DocumentDetail
      document={selectedDocument}
      documentNameFor={searchScopeDocumentLabel}
      relatedDocuments={detailRelatedDocuments}
      detail={documentDetail}
      outlineRevision={documentOutlineRevision}
      originalDownloadAvailable={originalDownloadAvailable}
      selectedExcerpt={selectedExcerpt}
      selectedChunkIndex={selectedChunkIndex}
      selectedQuery={selectedSearchQuery}
      previewUnavailable={detailPreviewUnavailable}
      loading={detailLoading}
      busy={busy}
      notice={notice}
      isFavorite={!!selectedDocument && favoriteDocumentIds.includes(selectedDocument.id)}
      hasOtherSearchableDocuments={!!selectedDocument && searchableDocuments.some(doc => doc.id !== selectedDocument.id)}
      backLabel={documentReturnPageRef.current === 'search' ? '검색으로 돌아가기' : documentReturnPageRef.current === 'favorites' ? '즐겨찾기로 돌아가기' : documentReturnPageRef.current === 'saved' ? '저장한 근거로 돌아가기' : '내 문서로 돌아가기'}
      onAskAboutDocument={askAboutDocument}
      onOpenRelatedDocument={doc => { void openDocument(doc) }}
      onSearchAll={searchAllFromDocument}
      onRetryDetail={() => {
        if (!selectedDocument) return
        const source: SearchResult | null = selectedExcerpt !== null && selectedChunkIndex !== null ? {
          document_id: selectedDocument.id,
          chunk_id: `retry-${selectedDocument.id}-${selectedChunkIndex}`,
          filename: selectedDocument.filename,
          page_number: null,
          section_path: null,
          chunk_index: selectedChunkIndex,
          excerpt: selectedExcerpt,
        } : null
        void openDocument(selectedDocument, source, selectedSearchQuery)
      }}
      onBack={() => navigate(documentReturnPageRef.current, true)}
      onBrowseDocuments={() => navigate('documents')}
      onToggleFavorite={toggleFavoriteDocument}
      onIndex={doc => { void indexDocument(doc) }}
      onRetryExtraction={doc => { void retryDocumentExtraction(doc) }}
      onDelete={doc => { void remove(doc) }}
      onLoadChunkPage={offset => { void loadDocumentChunkPage(offset) }}
      onNavigateToChunk={navigateToDocumentChunk}
    />}

    {page === 'about' && <ProjectOverview
      onBack={() => navigate('search')}
      onOpenDocuments={() => navigate('documents')}
      onTryExample={tryAboutExample}
      canTryExample={!busy && !databaseUnavailable && aboutExampleDocumentReady}
      exampleActionLabel={answerUnavailable ? '이 질문으로 문서에서 찾기' : '이 질문으로 답변 보기'}
    />}
    {page === 'guide' && <UserGuide
      onBack={() => navigate('search')}
      onOpenSearch={() => {
        focusSearchAfterNavigation.current = true
        selectSearchAfterNavigation.current = true
        setWorkspacePane('search')
        navigate('search')
      }}
      onOpenDocuments={() => navigate('documents')}
    />}
    {page === 'activity' && <ActivityPage
      items={recentSearches.map(item => ({ ...item, scopeLabel: recentSearchScopeLabel(item) }))}
      filters={activityFilters}
      onFiltersChange={setActivityFilters}
      storageMode={recentSearchStorageMode}
      suggestedDocuments={activitySuggestedDocuments}
      documentNameFor={searchScopeDocumentLabel}
      onAskAboutDocument={doc => askAboutWorkspaceDocument(doc)}
      busy={busy}
      canRepeat={canRepeatRecentSearch}
      onRepeat={item => { navigate('search', false, null); repeatRecentSearch(item) }}
      onEdit={editRecentSearch}
      onRemove={removeRecentSearch}
      onClear={() => setRecentSearches([])}
      onRestore={items => setRecentSearches(current => mergeRestoredRecentSearches(items, current))}
      onSearch={() => openQuestionDraft('', null, semanticSearchUnavailable ? 'keyword' : 'hybrid')}
    />}
    {page === 'favorites' && <FavoritesPage
      documents={favoriteDocuments}
      documentNameFor={searchScopeDocumentLabel}
      suggestedDocuments={homeRecentDocuments}
      documentsLoaded={documentsLoaded}
      documentsRefreshing={documentsRefreshing}
      documentsError={documentsError}
      storageWarning={favoriteStorageWarning}
      busy={busy}
      onOpen={doc => { void openDocument(doc) }}
      onAsk={doc => askAboutWorkspaceDocument(doc)}
      onBrowse={() => navigate('documents')}
      onRefreshDocuments={() => { void refreshDocuments() }}
      onToggleFavorite={toggleFavoriteDocument}
      onIndex={doc => { void indexDocument(doc) }}
      onRetryExtraction={doc => { void retryDocumentExtraction(doc) }}
    />}
    {page === 'saved' && <SavedEvidencePage
      items={savedEvidence}
      view={savedEvidenceView}
      onViewChange={setSavedEvidenceView}
      documentNameFor={displayDocumentName}
      suggestedDocuments={activitySuggestedDocuments}
      busy={busy}
      onAskAboutDocument={doc => askAboutWorkspaceDocument(doc)}
      onReuseQuestion={openQuestionDraft}
      sourceAvailabilityFor={savedSourceAvailability}
      copyStatus={sourceCopyMessage}
      storageWarning={savedEvidenceStorageWarning}
      onOpen={openSource}
      onRemove={chunkId => setSavedEvidence(current => current.filter(item => item.chunk_id !== chunkId))}
      onRestore={item => setSavedEvidence(current => current.some(saved => saved.chunk_id === item.chunk_id) ? current : [item, ...current].slice(0, 200))}
      onCopy={source => copySource(source)}
      onBrowse={() => navigate('documents')}
      onSearch={() => { focusSearchAfterNavigation.current = true; navigate('search') }}
    />}
    {page === 'account' && <AccountPage
      name={user.display_name}
      email={user.email}
      method={user.auth_method}
      onBack={() => navigate('search')}
      onLogout={() => void logout()}
    />}
    </main>
    {documentsToDelete && <DeleteConfirmDialog
      documentLabels={documentsToDelete.map(searchScopeDocumentLabel)}
      busy={busy}
      onCancel={() => setDocumentsToDelete(null)}
      onConfirm={() => { void confirmRemove() }}
    />}
    <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" multiple hidden disabled={busy} onChange={e => void upload(e.target.files)}/>
    <footer><span>문서담</span><span>PDF · DOCX · TXT</span><div><a href="/guide" onClick={event => { if (isPlainLeftClick(event)) { event.preventDefault(); navigate('guide') } }}>사용 안내 <ArrowUpRight size={12}/></a><a href="/about" onClick={event => { if (isPlainLeftClick(event)) { event.preventDefault(); navigate('about') } }}>프로젝트 소개 <ArrowUpRight size={12}/></a></div></footer>
  </div>
}

export default App
