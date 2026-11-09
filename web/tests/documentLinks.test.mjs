import test from 'node:test'
import assert from 'node:assert/strict'
import { documentUrl, isPlainLeftClick } from '../src/documentLinks.mjs'

test('builds a document URL and safely encodes its identifier', () => {
  assert.equal(documentUrl('folder/a b'), '/documents/folder%2Fa%20b')
})

test('adds a one-based chunk anchor for a zero-based chunk index', () => {
  assert.equal(documentUrl('doc-1', 0), '/documents/doc-1#chunk-1')
  assert.equal(documentUrl('doc-1', 12), '/documents/doc-1#chunk-13')
})

test('omits an invalid chunk anchor', () => {
  assert.equal(documentUrl('doc-1', -1), '/documents/doc-1')
  assert.equal(documentUrl('doc-1', Number.NaN), '/documents/doc-1')
})

test('only handles an unmodified primary click in the current tab', () => {
  const base = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }
  assert.equal(isPlainLeftClick(base), true)
  assert.equal(isPlainLeftClick({ ...base, button: 1 }), false)
  assert.equal(isPlainLeftClick({ ...base, ctrlKey: true }), false)
  assert.equal(isPlainLeftClick({ ...base, metaKey: true }), false)
  assert.equal(isPlainLeftClick({ ...base, shiftKey: true }), false)
  assert.equal(isPlainLeftClick({ ...base, altKey: true }), false)
})
