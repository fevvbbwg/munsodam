export function summarizeWorkspaceTopics({
  documentCount,
  topicCount,
  loadingCount,
  unavailableCount,
  searchableCount,
}) {
  if (documentCount === 0) return ''

  const readinessSummary = searchableCount === documentCount
    ? '모두 질문 가능'
    : `검색 가능 ${searchableCount}/${documentCount}`

  if (topicCount > 0) {
    return `${topicCount}개 주제 · ${readinessSummary}`
      + (loadingCount > 0 ? ' · 더 불러오는 중' : '')
      + (unavailableCount > 0 ? ' · 일부 확인 필요' : '')
  }
  if (loadingCount > 0) {
    return `주제 불러오는 중 · ${readinessSummary}${unavailableCount > 0 ? ' · 일부 확인 필요' : ''}`
  }
  if (unavailableCount === documentCount) return `주제 확인 필요 · ${readinessSummary}`
  if (unavailableCount > 0) return `일부 문서 주제 확인 필요 · ${readinessSummary}`
  if (searchableCount === documentCount) return '문서 전체 질문 가능'
  return `${readinessSummary} · 제목 구분 없이 질문 가능`
}
