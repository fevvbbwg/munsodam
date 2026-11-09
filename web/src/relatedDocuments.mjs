export function selectRelatedDocuments(documents, recentDocumentIds, selectedDocumentId, limit = 3) {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3
  const recentIds = new Set(recentDocumentIds)
  const documentsById = new Map(documents.map(document => [document.id, document]))
  const ordered = []
  const included = new Set([selectedDocumentId])

  for (const documentId of recentDocumentIds) {
    const document = documentsById.get(documentId)
    if (!document || included.has(document.id)) continue
    included.add(document.id)
    ordered.push(document)
  }

  const documentOrder = new Map(documents.map((document, index) => [document.id, index]))
  const remainingDocuments = []
  for (const document of documents) {
    if (included.has(document.id) || recentIds.has(document.id)) continue
    included.add(document.id)
    remainingDocuments.push(document)
  }

  remainingDocuments.sort((left, right) => {
    const leftTime = Date.parse(left.created_at)
    const rightTime = Date.parse(right.created_at)
    const leftTimeSafe = Number.isFinite(leftTime) ? leftTime : 0
    const rightTimeSafe = Number.isFinite(rightTime) ? rightTime : 0
    return rightTimeSafe - leftTimeSafe || documentOrder.get(left.id) - documentOrder.get(right.id)
  })
  ordered.push(...remainingDocuments)

  return ordered.slice(0, safeLimit)
}

export function selectRecentHomeDocuments(documents, recentDocumentIds, favoriteDocumentIds, limit = 3) {
  const favoriteIds = new Set(favoriteDocumentIds)
  const candidates = documents.filter(document => !favoriteIds.has(document.id))
  return selectRelatedDocuments(candidates, recentDocumentIds, null, limit)
}

export function selectWorkspaceRecentDocuments(documents, selectedDocumentId, recentDocumentIds, favoriteDocumentIds, limit = 6) {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6
  if (safeLimit === 0) return []

  const selectedDocument = documents.find(document => document.id === selectedDocumentId)
  const recentDocuments = selectRecentHomeDocuments(
    documents,
    recentDocumentIds,
    favoriteDocumentIds,
    safeLimit - Number(Boolean(selectedDocument)),
  )

  return [
    ...(selectedDocument ? [selectedDocument] : []),
    ...recentDocuments.filter(document => document.id !== selectedDocument?.id),
  ].slice(0, safeLimit)
}
