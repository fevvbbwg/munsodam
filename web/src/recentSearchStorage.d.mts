export type RecentSearchStorageMode = 'persistent' | 'session' | 'memory'
export type RecentSearchStorageItem = {
  query: string
  mode: 'vector' | 'keyword' | 'hybrid'
  view: 'results' | 'answer'
  documentId: string | null
  createdAt?: number
}
export type RecentSearchStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => boolean
  removeItem: (key: string) => boolean
}
export type RecentSearchStores = { persistent: RecentSearchStore; session: RecentSearchStore }
export function loadRecentSearches(userId: string, stores?: RecentSearchStores): RecentSearchStorageItem[]
export function mergeRestoredRecentSearches(restored: RecentSearchStorageItem[], current: RecentSearchStorageItem[]): RecentSearchStorageItem[]
export function saveRecentSearches(userId: string, searches: RecentSearchStorageItem[], stores?: RecentSearchStores): RecentSearchStorageMode
