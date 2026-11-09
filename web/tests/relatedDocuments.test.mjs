import test from 'node:test'
import assert from 'node:assert/strict'
import { selectRecentHomeDocuments, selectRelatedDocuments, selectWorkspaceRecentDocuments } from '../src/relatedDocuments.mjs'

const documents = [
  { id: 'a', filename: 'a.txt', created_at: '2026-01-01T00:00:00Z' },
  { id: 'b', filename: 'b.txt', created_at: '2026-01-02T00:00:00Z' },
  { id: 'c', filename: 'c.txt', created_at: '2026-01-04T00:00:00Z' },
  { id: 'd', filename: 'd.txt', created_at: '2026-01-03T00:00:00Z' },
]

test('shows other recently opened documents first and excludes the current document', () => {
  assert.deepEqual(
    selectRelatedDocuments(documents, ['c', 'a', 'missing'], 'a'),
    [documents[2], documents[3], documents[1]],
  )
})

test('deduplicates recent ids and respects the requested limit', () => {
  assert.deepEqual(
    selectRelatedDocuments(documents, ['b', 'b', 'c'], 'a', 2),
    [documents[1], documents[2]],
  )
})

test('returns no suggestions when the current document is the only document', () => {
  assert.deepEqual(selectRelatedDocuments([documents[0]], ['a'], 'a'), [])
})

test('orders fallback documents by most recently added', () => {
  assert.deepEqual(
    selectRelatedDocuments(documents, [], 'a'),
    [documents[2], documents[3], documents[1]],
  )
})

test('fills the home recent section after opened documents and excludes favorites', () => {
  assert.deepEqual(
    selectRecentHomeDocuments(documents, ['c', 'b'], ['b']),
    [documents[2], documents[3], documents[0]],
  )
})

test('pins a selected document ahead of recent documents, including selected favorites', () => {
  assert.deepEqual(
    selectWorkspaceRecentDocuments(documents, 'a', ['c', 'd'], ['a', 'b'], 3),
    [documents[0], documents[2], documents[3]],
  )
})

test('respects a zero workspace recent limit', () => {
  assert.deepEqual(selectWorkspaceRecentDocuments(documents, 'a', ['c'], [], 0), [])
})
