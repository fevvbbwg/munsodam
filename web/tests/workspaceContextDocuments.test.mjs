import test from 'node:test'
import assert from 'node:assert/strict'
import { selectWorkspaceContextDocuments } from '../src/workspaceContextDocuments.mjs'

const docs = names => names.map(id => ({ id }))

test('pins the currently selected document before recents and favorites', () => {
  const [selected, ...rest] = docs(['selected', 'recent-1', 'recent-2', 'favorite-1'])
  assert.deepEqual(
    selectWorkspaceContextDocuments(selected, rest.slice(0, 2), rest.slice(2)),
    [selected, rest[0], rest[2]],
  )
})

test('keeps a favorite visible when a long recent list would otherwise fill the context', () => {
  const [recent1, recent2, recent3, recent4, favorite] = docs(['recent-1', 'recent-2', 'recent-3', 'recent-4', 'favorite'])
  assert.deepEqual(selectWorkspaceContextDocuments(null, [recent1, recent2, recent3, recent4], [favorite]), [recent1, recent2, favorite])
})

test('fills unused context slots from favorites when fewer recent documents exist', () => {
  const [recent, favorite1, favorite2] = docs(['recent', 'favorite-1', 'favorite-2'])
  assert.deepEqual(selectWorkspaceContextDocuments(null, [recent], [favorite1, favorite2]), [recent, favorite1, favorite2])
})

test('uses recent documents for all slots when no favorites are available', () => {
  const recent = docs(['recent-1', 'recent-2', 'recent-3', 'recent-4'])
  assert.deepEqual(selectWorkspaceContextDocuments(null, recent, []), recent.slice(0, 3))
})

test('removes duplicate ids and respects a zero or custom limit', () => {
  const [recent, favorite, other] = docs(['same', 'same', 'other'])
  assert.deepEqual(selectWorkspaceContextDocuments(null, [recent], [favorite, other]), [recent, other])
  assert.deepEqual(selectWorkspaceContextDocuments(null, [recent], [favorite], 0), [])
  const [uniqueFavorite] = docs(['favorite-unique'])
  assert.deepEqual(selectWorkspaceContextDocuments(null, [recent, other], [uniqueFavorite], 2), [recent, uniqueFavorite])
})
