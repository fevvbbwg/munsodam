export type DocumentLifecycle = 'extract_failed' | 'index_failed' | 'processing' | 'searchable'

export function getDocumentLifecycle(status: string, indexStatus: string): DocumentLifecycle {
  if (status === 'failed') return 'extract_failed'
  if (status === 'processing') return 'processing'
  if (indexStatus === 'failed') return 'index_failed'
  if (status === 'completed' && indexStatus === 'ready') return 'searchable'
  return 'processing'
}

export function getDocumentChunkSummary(document: { status: string; index_status: string; chunk_count: number }): string {
  const lifecycle = getDocumentLifecycle(document.status, document.index_status)
  if (lifecycle === 'processing') return document.status === 'processing' ? '본문 추출 중' : '검색 준비 중'
  if (lifecycle === 'extract_failed') return '본문 읽기 실패'
  if (lifecycle === 'index_failed') return `${document.chunk_count}개 본문 구간 · 검색 준비 필요`
  return `${document.chunk_count}개 본문 구간`
}

export function countSearchableDocumentChunks(documents: Array<{ status: string; index_status: string; chunk_count: number }>): number {
  return documents.reduce((total, document) => getDocumentLifecycle(document.status, document.index_status) === 'searchable'
    ? total + Math.max(0, document.chunk_count || 0)
    : total, 0)
}
