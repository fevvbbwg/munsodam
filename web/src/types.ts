export type Doc = {
  id: string
  filename: string
  file_type: string
  status: string
  index_status: string
  error_message: string | null
  chunk_count: number
  created_at: string
}

export type DocDetail = Doc & {
  chunk_offset: number
  chunk_limit: number
  chunks: {
    id: string
    chunk_index: number
    page_number: number | null
    section_path: string | null
    content: string
  }[]
}

export type DocOutline = {
  document_id: string
  filename: string
  chunk_count: number
  preview?: string
  sections: { title: string; chunk_count: number; first_chunk_index: number }[]
  more_sections: number
  unavailable?: boolean
}

export type SearchResult = {
  document_id: string
  chunk_id: string
  filename: string
  page_number: number | null
  section_path: string | null
  section_id?: string | null
  chunk_index: number
  excerpt: string
  cosine_distance?: number | null
  match_type?: 'keyword' | 'semantic'
}

export type SavedEvidence = SearchResult & {
  query: string
  saved_at: number
}

export type ChatResult = {
  answer: string
  abstained: boolean
  reason: string | null
  sources: SearchResult[]
  conflicting_sources?: SearchResult[]
}
