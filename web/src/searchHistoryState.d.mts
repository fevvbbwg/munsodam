export type SearchHistoryMode = 'vector' | 'keyword' | 'hybrid'
export type SearchHistoryView = 'results' | 'answer'
export type SearchHistoryEntry = {
  query: string
  mode: SearchHistoryMode
  view: SearchHistoryView
  documentId: string | null
}
export type SearchHistoryAvailability = {
  documentsReady: boolean
  documentScopeAvailable: boolean
  databaseAvailable: boolean
  semanticSearchAvailable: boolean
  answerAvailable: boolean
}
export type SearchHistoryRestore = {
  status: 'waiting' | 'ready'
  entry: SearchHistoryEntry
  notices: string[]
}

export const SEARCH_HISTORY_STATE_KEY: 'munsodamSearch'
export const DOCUMENT_FOCUS_QUERY_STATE_KEY: 'munsodamDocumentFocus'
export function readSearchHistoryEntry(state: unknown): SearchHistoryEntry | null
export function mergeSearchHistoryEntry(state: unknown, entry: SearchHistoryEntry | null): Record<string, unknown>
export function readDocumentFocusQuery(state: unknown): string | null
export function mergeDocumentFocusQuery(state: unknown, query: string | null): Record<string, unknown>
export function sameSearchHistoryEntry(left: SearchHistoryEntry | null, right: SearchHistoryEntry | null): boolean
export function resolveSearchHistoryRestore(entry: SearchHistoryEntry, availability: SearchHistoryAvailability): SearchHistoryRestore
