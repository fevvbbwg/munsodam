import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEARCH_HISTORY_STATE_KEY,
  mergeSearchHistoryEntry,
  readSearchHistoryEntry,
  resolveSearchHistoryRestore,
  sameSearchHistoryEntry,
} from '../src/searchHistoryState.mjs'

const entry = { query: '휴가 신청 기한', mode: 'hybrid', view: 'results', documentId: 'hr-policy' }

test('restores and normalizes a scoped search from browser history', () => {
  assert.deepEqual(readSearchHistoryEntry({
    [SEARCH_HISTORY_STATE_KEY]: { ...entry, query: '  휴가 신청 기한  ' },
  }), entry)
})

test('supports earlier entries that did not record a document scope', () => {
  assert.deepEqual(readSearchHistoryEntry({
    [SEARCH_HISTORY_STATE_KEY]: { query: '출장 정산', mode: 'keyword', view: 'answer' },
  }), { query: '출장 정산', mode: 'keyword', view: 'answer', documentId: null })
})

test('ignores malformed or unsupported history entries', () => {
  for (const value of [
    null,
    {},
    { query: 'x', mode: 'unsupported', view: 'results' },
    { query: 'x', mode: 'vector', view: 'detail' },
    { query: ' ', mode: 'hybrid', view: 'results' },
    { query: 'x', mode: 'hybrid', view: 'results', documentId: 4 },
  ]) {
    assert.equal(readSearchHistoryEntry({ [SEARCH_HISTORY_STATE_KEY]: value }), null)
  }
  assert.equal(readSearchHistoryEntry(null), null)
})

test('caps restored queries at the search input limit', () => {
  const query = '가'.repeat(2200)
  assert.equal(readSearchHistoryEntry({
    [SEARCH_HISTORY_STATE_KEY]: { query, mode: 'vector', view: 'results' },
  })?.query.length, 2000)
})

test('merges search state without discarding unrelated browser history state', () => {
  const merged = mergeSearchHistoryEntry({ scrollKey: 'detail', other: 42 }, entry)
  assert.deepEqual(merged, {
    scrollKey: 'detail',
    other: 42,
    [SEARCH_HISTORY_STATE_KEY]: entry,
  })
  assert.deepEqual(mergeSearchHistoryEntry(merged, null), { scrollKey: 'detail', other: 42 })
})

test('compares query, mode, view, and document scope before accepting async results', () => {
  assert.equal(sameSearchHistoryEntry(entry, { ...entry }), true)
  assert.equal(sameSearchHistoryEntry(entry, { ...entry, mode: 'keyword' }), false)
  assert.equal(sameSearchHistoryEntry(entry, { ...entry, view: 'answer' }), false)
  assert.equal(sameSearchHistoryEntry(entry, { ...entry, documentId: null }), false)
  assert.equal(sameSearchHistoryEntry(entry, null), false)
})

test('waits for the document list before restoring a document-scoped search', () => {
  assert.deepEqual(resolveSearchHistoryRestore(entry, {
    documentsReady: false,
    documentScopeAvailable: false,
    databaseAvailable: true,
    semanticSearchAvailable: true,
    answerAvailable: true,
  }), { status: 'waiting', entry, notices: [] })
})

test('falls back to all searchable documents and keyword results when saved capabilities disappear', () => {
  const answerEntry = { ...entry, view: 'answer' }
  assert.deepEqual(resolveSearchHistoryRestore(answerEntry, {
    documentsReady: true,
    documentScopeAvailable: false,
    databaseAvailable: true,
    semanticSearchAvailable: false,
    answerAvailable: false,
  }), {
    status: 'ready',
    entry: { ...answerEntry, mode: 'keyword', view: 'results', documentId: null },
    notices: [
      '이 검색 기록의 문서는 사용할 수 없어 전체 문서에서 다시 찾습니다.',
      '의미 검색을 사용할 수 없어 정확한 단어로 다시 찾습니다.',
      '답변 기능을 사용할 수 없어 근거 문서 검색으로 이어갑니다.',
    ],
  })
})

test('keeps the saved search intact while its data store is unavailable', () => {
  assert.deepEqual(resolveSearchHistoryRestore(entry, {
    documentsReady: true,
    documentScopeAvailable: true,
    databaseAvailable: false,
    semanticSearchAvailable: false,
    answerAvailable: false,
  }), { status: 'waiting', entry, notices: [] })
})
