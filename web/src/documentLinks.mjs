export function documentUrl(documentId, chunkIndex = null) {
  const path = `/documents/${encodeURIComponent(documentId)}`
  return Number.isInteger(chunkIndex) && chunkIndex >= 0
    ? `${path}#chunk-${chunkIndex + 1}`
    : path
}

export function isPlainLeftClick(event) {
  return event.button === 0
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !event.altKey
}
