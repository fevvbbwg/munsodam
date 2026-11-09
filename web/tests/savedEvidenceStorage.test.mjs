import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSavedEvidence } from '../src/savedEvidenceStorage.mjs'

function createStore(value) {
  return { getItem: () => value }
}

const legacyEvidence = {
  document_id: 'doc-1',
  chunk_id: 'chunk-1',
  filename: 'policy.txt',
  chunk_index: 2,
  excerpt: 'Keep the receipt.',
  query: 'receipt',
  saved_at: 123,
}

test('restores legacy saved evidence without optional page and section fields', () => {
  assert.deepEqual(loadSavedEvidence('user-1', createStore(JSON.stringify([legacyEvidence]))), [{
    ...legacyEvidence,
    page_number: null,
    section_path: null,
    cosine_distance: null,
    match_type: undefined,
  }])
})

test('replaces out-of-range saved dates with a safe current time', () => {
  const evidence = { ...legacyEvidence, saved_at: 1e100 }
  assert.equal(loadSavedEvidence('user-1', createStore(JSON.stringify([evidence])), 456)[0].saved_at, 456)
})

test('skips malformed saved evidence without losing valid entries', () => {
  const malformed = { ...legacyEvidence, chunk_index: Number.MAX_SAFE_INTEGER + 1 }
  const valid = { ...legacyEvidence, chunk_id: 'chunk-2', saved_at: 789 }
  assert.deepEqual(loadSavedEvidence('user-1', createStore(JSON.stringify([malformed, valid]))).map(item => item.chunk_id), ['chunk-2'])
})

test('returns an empty list when browser storage or its JSON is unavailable', () => {
  assert.deepEqual(loadSavedEvidence('user-1', { getItem() { throw new Error('storage blocked') } }), [])
  assert.deepEqual(loadSavedEvidence('user-1', createStore('{broken')), [])
})
