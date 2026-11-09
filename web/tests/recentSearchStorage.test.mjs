import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRecentSearches, mergeRestoredRecentSearches, saveRecentSearches } from '../src/recentSearchStorage.mjs'

function createStore(initial = {}, { failRead = false, failWrite = false, failRemove = false } = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem(key) {
      if (failRead) throw new Error('storage read blocked')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (failWrite) return false
      values.set(key, value)
      return true
    },
    removeItem(key) {
      if (failRemove) return false
      values.delete(key)
      return true
    },
  }
}

const key = 'munsodam.user-1.recent-searches.v1'
const preferenceKey = 'munsodam.user-1.recent-searches-storage-mode.v1'
const recent = query => [{ query, mode: 'hybrid', view: 'results', documentId: null, createdAt: 123 }]

test('prefers a session copy over stale persistent history after storage fallback', () => {
  const persistent = createStore({ [key]: JSON.stringify(recent('오래된 검색')) }, { failRemove: true })
  const session = createStore({ [preferenceKey]: 'session', [key]: '[]' })

  assert.deepEqual(loadRecentSearches('user-1', { persistent, session }), [])
})

test('restores and migrates a session history when persistent storage becomes available', () => {
  const item = recent('출장 정산 기한')
  const persistent = createStore()
  const session = createStore({ [key]: JSON.stringify(item) })

  assert.deepEqual(loadRecentSearches('user-1', { persistent, session }), item)
  assert.equal(persistent.values.get(key), JSON.stringify(item))
  assert.equal(session.values.has(key), false)
})

test('reads session history when local storage access throws', () => {
  const item = recent('세션 검색')
  const persistent = createStore({}, { failRead: true })
  const session = createStore({ [preferenceKey]: 'session', [key]: JSON.stringify(item) })

  assert.deepEqual(loadRecentSearches('user-1', { persistent, session }), item)
})

test('recovers a valid session copy when the persistent value is malformed', () => {
  const item = recent('복구된 검색')
  const persistent = createStore({ [key]: '{broken json' })
  const session = createStore({ [key]: JSON.stringify(item) })

  assert.deepEqual(loadRecentSearches('user-1', { persistent, session }), item)
  assert.equal(persistent.values.get(key), JSON.stringify(item))
  assert.equal(session.values.has(key), false)
})

test('ignores out-of-range timestamps without discarding otherwise valid history', () => {
  const persistent = createStore({
    [key]: JSON.stringify([{ ...recent('날짜가 비정상인 검색')[0], createdAt: 1e100 }]),
  })

  assert.deepEqual(loadRecentSearches('user-1', { persistent, session: createStore() }), [{
    query: '날짜가 비정상인 검색', mode: 'hybrid', view: 'results', documentId: null, createdAt: undefined,
  }])
})

test('keeps updated history in the tab when persistent storage cannot be written or cleared', () => {
  const persistent = createStore({ [key]: JSON.stringify(recent('stale')) }, { failWrite: true, failRemove: true })
  const session = createStore()

  assert.equal(saveRecentSearches('user-1', recent('새 검색'), { persistent, session }), 'session')
  assert.deepEqual(loadRecentSearches('user-1', { persistent, session }), recent('새 검색'))
})

test('falls back to memory when both browser stores reject writes', () => {
  const persistent = createStore({}, { failWrite: true })
  const session = createStore({}, { failWrite: true })

  assert.equal(saveRecentSearches('user-1', recent('이번 검색'), { persistent, session }), 'memory')
})

test('restores deleted history in recency order while keeping newer searches first', () => {
  const restored = [
    { query: '오래된 검색', mode: 'hybrid', view: 'results', documentId: null, createdAt: 100 },
    { query: '삭제된 검색', mode: 'keyword', view: 'results', documentId: null, createdAt: 200 },
  ]
  const current = [
    { query: '새 검색', mode: 'vector', view: 'answer', documentId: null, createdAt: 400 },
  ]

  assert.deepEqual(mergeRestoredRecentSearches(restored, current), [current[0], restored[1], restored[0]])
})

test('keeps the newer version when restored and current history share a query and scope', () => {
  const restored = recent(' 같은 질문 ')[0]
  const current = { ...recent('같은 질문')[0], mode: 'keyword', createdAt: 500 }

  assert.deepEqual(mergeRestoredRecentSearches([restored], [current]), [current])
})
