export function savedSourceAvailability(documents, documentsLoaded, documentsError, documentId) {
  if (!documentsLoaded || documentsError) return null
  return documents.some(document => document.id === documentId)
}
