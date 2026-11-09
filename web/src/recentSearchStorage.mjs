const recentKey = userId => `munsodam.${userId}.recent-searches.v1`
const modeKey = userId => `munsodam.${userId}.recent-searches-storage-mode.v1`

function browserStore(kind) {
  return {
    getItem(key) {
      try { return globalThis[kind].getItem(key) } catch { return null }
    },
    setItem(key, value) {
      try { globalThis[kind].setItem(key, value); return true } catch { return false }
    },
    removeItem(key) {
      try { globalThis[kind].removeItem(key); return true } catch { return false }
    },
  }
}

function read(store, key) {
  try { return store.getItem(key) } catch { return null }
}

function write(store, key, value) {
  try { return store.setItem(key, value) !== false } catch { return false }
}

function remove(store, key) {
  try { return store.removeItem(key) !== false } catch { return false }
}

function normalizeKey(query) {
  return query.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

export function mergeRestoredRecentSearches(restored, current) {
  const byQueryAndScope = new Map()
  for (const item of [...current, ...restored]) {
    const key = `${normalizeKey(item.query)}:${item.documentId ?? ''}`
    if (!byQueryAndScope.has(key)) byQueryAndScope.set(key, item)
  }
  return [...byQueryAndScope.values()]
    .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
    .slice(0, 20)
}

function parseSearches(stored) {
  let parsed
  try { parsed = JSON.parse(stored) } catch { return null }
  if (!Array.isArray(parsed)) return null
  const unique = []
  const seen = new Set()
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || typeof item.query !== 'string' || !item.query.trim()) continue
    if (!['vector', 'keyword', 'hybrid'].includes(item.mode)) continue
    if (item.view !== undefined && item.view !== 'results' && item.view !== 'answer') continue
    if (item.documentId !== undefined && item.documentId !== null && typeof item.documentId !== 'string') continue
    const value = {
      query: item.query.trim().slice(0, 2000),
      mode: item.mode,
      view: item.view === 'answer' ? 'answer' : 'results',
      documentId: typeof item.documentId === 'string' ? item.documentId : null,
      createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt > 0 && Number.isFinite(new Date(item.createdAt).getTime()) ? item.createdAt : undefined,
    }
    const dedupeKey = `${normalizeKey(value.query)}:${value.documentId ?? ''}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    unique.push(value)
    if (unique.length === 20) break
  }
  return unique
}

export function loadRecentSearches(userId, stores) {
  const persistent = stores?.persistent ?? browserStore('localStorage')
  const session = stores?.session ?? browserStore('sessionStorage')
  const key = recentKey(userId)
  const preferenceKey = modeKey(userId)
  const sessionPreferred = read(session, preferenceKey) === 'session'
  const candidates = sessionPreferred
    ? [{ store: session, isSession: true }, { store: persistent, isSession: false }]
    : [{ store: persistent, isSession: false }, { store: session, isSession: true }]

  for (const candidate of candidates) {
    const stored = read(candidate.store, key)
    if (stored === null) continue
    const searches = parseSearches(stored)
    if (searches === null) continue
    if (candidate.isSession && write(persistent, key, stored)) {
      if (!remove(session, preferenceKey)) write(session, preferenceKey, 'persistent')
      remove(session, key)
    }
    return searches
  }
  return []
}

export function saveRecentSearches(userId, searches, stores) {
  const persistent = stores?.persistent ?? browserStore('localStorage')
  const session = stores?.session ?? browserStore('sessionStorage')
  const key = recentKey(userId)
  const preferenceKey = modeKey(userId)
  const serialized = JSON.stringify(searches)

  if (write(persistent, key, serialized)) {
    if (!remove(session, preferenceKey)) write(session, preferenceKey, 'persistent')
    remove(session, key)
    return 'persistent'
  }

  remove(persistent, key)
  if (write(session, preferenceKey, 'session') && write(session, key, serialized)) return 'session'
  remove(session, preferenceKey)
  return 'memory'
}
