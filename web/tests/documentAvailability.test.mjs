import test from 'node:test'
import assert from 'node:assert/strict'
import { savedSourceAvailability } from '../src/documentAvailability.mjs'

const documents = [{ id: 'doc-a' }]

test('does not mark saved sources missing while the document list is loading', () => {
  assert.equal(savedSourceAvailability([], false, '', 'doc-a'), null)
})

test('does not infer deletion when the document list request failed', () => {
  assert.equal(savedSourceAvailability([], true, '서버 오류', 'doc-a'), null)
})

test('recognizes an available source document', () => {
  assert.equal(savedSourceAvailability(documents, true, '', 'doc-a'), true)
})

test('marks a source unavailable only after a successful complete list', () => {
  assert.equal(savedSourceAvailability(documents, true, '', 'doc-deleted'), false)
})
