export type SavedEvidenceStorageItem = {
  document_id: string
  chunk_id: string
  filename: string
  page_number: number | null
  section_path: string | null
  chunk_index: number
  excerpt: string
  cosine_distance: number | null
  match_type?: 'keyword' | 'semantic'
  query: string
  saved_at: number
}
export type SavedEvidenceStorage = { getItem: (key: string) => string | null }
export function savedEvidenceKey(userId: string): string
export function loadSavedEvidence(userId: string, storage?: SavedEvidenceStorage, now?: number): SavedEvidenceStorageItem[]
