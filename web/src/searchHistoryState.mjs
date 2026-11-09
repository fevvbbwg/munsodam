export const SEARCH_HISTORY_STATE_KEY = 'munsodamSearch'
export const DOCUMENT_FOCUS_QUERY_STATE_KEY = 'munsodamDocumentFocus'

const modes = new Set(['vector', 'keyword', 'hybrid'])
const views = new Set(['results', 'answer'])

export function readSearchHistoryEntry(state) {
  if (!state || typeof state !== 'object') return null
  const entry = state[SEARCH_HISTORY_STATE_KEY]
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.query !== 'string' || !entry.query.trim()) return null
  if (!modes.has(entry.mode) || !views.has(entry.view)) return null
  if (entry.documentId !== undefined && entry.documentId !== null && typeof entry.documentId !== 'string') return null
  return {
    query: entry.query.trim().slice(0, 2000),
    mode: entry.mode,
    view: entry.view,
    documentId: typeof entry.documentId === 'string' ? entry.documentId : null,
  }
}

export function mergeSearchHistoryEntry(state, entry) {
  const nextState = state && typeof state === 'object' ? { ...state } : {}
  if (entry) nextState[SEARCH_HISTORY_STATE_KEY] = entry
  else delete nextState[SEARCH_HISTORY_STATE_KEY]
  return nextState
}

export function readDocumentFocusQuery(state) {
  if (!state || typeof state !== 'object') return null
  const query = state[DOCUMENT_FOCUS_QUERY_STATE_KEY]
  return typeof query === 'string' && query.trim() ? query.trim().slice(0, 2000) : null
}

export function mergeDocumentFocusQuery(state, query) {
  const nextState = state && typeof state === 'object' ? { ...state } : {}
  const normalizedQuery = typeof query === 'string' ? query.trim().slice(0, 2000) : ''
  if (normalizedQuery) nextState[DOCUMENT_FOCUS_QUERY_STATE_KEY] = normalizedQuery
  else delete nextState[DOCUMENT_FOCUS_QUERY_STATE_KEY]
  return nextState
}

export function sameSearchHistoryEntry(left, right) {
  return left?.query === right?.query
    && left?.mode === right?.mode
    && left?.view === right?.view
    && left?.documentId === right?.documentId
}

export function resolveSearchHistoryRestore(entry, availability) {
  if (entry.documentId && !availability.documentsReady) {
    return { status: 'waiting', entry, notices: [] }
  }
  if (!availability.databaseAvailable) {
    return { status: 'waiting', entry, notices: [] }
  }

  const restoredEntry = { ...entry }
  const notices = []
  if (restoredEntry.documentId && !availability.documentScopeAvailable) {
    restoredEntry.documentId = null
    notices.push('이 검색 기록의 문서는 사용할 수 없어 전체 문서에서 다시 찾습니다.')
  }
  if (restoredEntry.mode !== 'keyword' && !availability.semanticSearchAvailable) {
    restoredEntry.mode = 'keyword'
    notices.push('의미 검색을 사용할 수 없어 정확한 단어로 다시 찾습니다.')
  }
  if (restoredEntry.view === 'answer' && !availability.answerAvailable) {
    restoredEntry.view = 'results'
    notices.push('답변 기능을 사용할 수 없어 근거 문서 검색으로 이어갑니다.')
  }
  return { status: 'ready', entry: restoredEntry, notices }
}
