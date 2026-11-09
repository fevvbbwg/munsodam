export function selectWorkspaceContextDocuments(selectedDocument, recentDocuments, favoriteDocuments, limit = 3) {
  const maxItems = Number.isSafeInteger(limit) ? Math.max(0, limit) : 3
  if (maxItems === 0) return []

  const selected = selectedDocument ? [selectedDocument] : []
  const selectedId = selectedDocument?.id
  const recent = recentDocuments.filter(document => document.id !== selectedId)
  const favorites = favoriteDocuments.filter(document => document.id !== selectedId)
  const availableSlots = Math.max(0, maxItems - selected.length)
  const reservedFavoriteSlots = favorites.length > 0 ? Math.min(1, availableSlots) : 0
  const recentSlots = Math.min(recent.length, availableSlots - reservedFavoriteSlots)
  const chosenRecent = recent.slice(0, recentSlots)
  const chosenFavorites = favorites.slice(0, availableSlots - chosenRecent.length)
  const unique = new Map()

  for (const document of [...selected, ...chosenRecent, ...chosenFavorites]) {
    if (typeof document?.id === 'string' && document.id && !unique.has(document.id)) unique.set(document.id, document)
    if (unique.size === maxItems) break
  }

  return [...unique.values()]
}
