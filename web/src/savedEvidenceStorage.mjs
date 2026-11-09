export const savedEvidenceKey = userId => `munsodam.${userId}.saved-evidence.v1`
const MAX_SAVED_EVIDENCE = 200
const MAX_JS_DATE = 8_640_000_000_000_000

function isValidDateValue(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && Math.abs(value) <= MAX_JS_DATE
}

function normalizeSavedEvidence(parsed, now) {
  if (!Array.isArray(parsed)) return []
  const unique = []
  const seen = new Set()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const value = item
    if (typeof value.document_id !== 'string' || !value.document_id
        || typeof value.chunk_id !== 'string' || !value.chunk_id
        || typeof value.filename !== 'string' || !value.filename.trim()
        || typeof value.excerpt !== 'string'
        || typeof value.query !== 'string' || !value.query.trim()
        || !Number.isSafeInteger(value.chunk_index) || value.chunk_index < 0
        || (value.page_number !== undefined && value.page_number !== null
          && (!Number.isSafeInteger(value.page_number) || value.page_number < 1))
        || (value.section_path !== undefined && value.section_path !== null && typeof value.section_path !== 'string')) continue
    if (seen.has(value.chunk_id)) continue
    seen.add(value.chunk_id)
    unique.push({
      document_id: value.document_id,
      chunk_id: value.chunk_id,
      filename: value.filename.slice(0, 255),
      page_number: typeof value.page_number === 'number' ? value.page_number : null,
      section_path: typeof value.section_path === 'string' ? value.section_path.slice(0, 500) : null,
      chunk_index: value.chunk_index,
      excerpt: value.excerpt.slice(0, 12000),
      cosine_distance: typeof value.cosine_distance === 'number' && Number.isFinite(value.cosine_distance) ? value.cosine_distance : null,
      match_type: value.match_type === 'keyword' || value.match_type === 'semantic' ? value.match_type : undefined,
      query: value.query.trim().slice(0, 2000),
      saved_at: isValidDateValue(value.saved_at) ? value.saved_at : now,
    })
    if (unique.length >= MAX_SAVED_EVIDENCE) break
  }
  return unique
}

export function loadSavedEvidence(userId, storage, now = Date.now()) {
  try {
    const target = storage ?? globalThis.localStorage
    const stored = target.getItem(savedEvidenceKey(userId))
    if (!stored) return []
    return normalizeSavedEvidence(JSON.parse(stored), now)
  } catch {
    return []
  }
}
