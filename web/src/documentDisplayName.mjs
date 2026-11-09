export function createDocumentDisplayNames(documents) {
  const groups = new Map()
  for (const document of documents) {
    const key = document.filename.toLocaleLowerCase('ko-KR')
    const group = groups.get(key) ?? []
    group.push(document)
    groups.set(key, group)
  }

  const names = new Map()
  for (const group of groups.values()) {
    if (group.length === 1) {
      names.set(group[0].id, group[0].filename)
      continue
    }
    const sortedDocuments = group.slice().sort((left, right) => {
      const leftDate = new Date(left.created_at).getTime()
      const rightDate = new Date(right.created_at).getTime()
      const validDates = Number.isFinite(leftDate) && Number.isFinite(rightDate)
      return (validDates ? leftDate - rightDate : 0) || left.id.localeCompare(right.id, 'en')
    })
    sortedDocuments.forEach((document, index) => {
      const addedAt = new Date(document.created_at)
      const timestamp = Number.isNaN(addedAt.getTime())
        ? '등록 시각 확인 필요'
        : addedAt.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
      names.set(document.id, `${document.filename} · ${timestamp} · ${index + 1}번째 등록`)
    })
  }
  return names
}

export function documentDisplayName(document, documents) {
  return createDocumentDisplayNames(documents).get(document.id) ?? document.filename
}

export function displayDocumentName(documents, documentId, fallback) {
  const document = documents.find(doc => doc.id === documentId)
  return document ? documentDisplayName(document, documents) : fallback
}
