import test from 'node:test'
import assert from 'node:assert/strict'
import { displayDocumentName, documentDisplayName } from '../src/documentDisplayName.mjs'

const document = {
  id: 'doc-a',
  filename: '회의록.docx',
  created_at: '2026-11-02T09:30:00+09:00',
}

test('keeps an unambiguous document name unchanged', () => {
  assert.equal(documentDisplayName(document, [document]), '회의록.docx')
})

test('adds the creation time when another document has the same name ignoring case', () => {
  const duplicate = { ...document, id: 'doc-b', filename: '회의록.DOCX', created_at: '2026-11-02T14:10:00+09:00' }
  const label = documentDisplayName(document, [document, duplicate])
  assert.match(label, /^회의록\.docx · /u)
  assert.notEqual(label, document.filename)
})

test('uses a stable registration number when duplicate names share a timestamp', () => {
  const first = { ...document, id: 'doc-a' }
  const second = { ...document, id: 'doc-b' }
  const documents = [second, first]
  assert.match(documentDisplayName(first, documents), / · 1번째 등록$/u)
  assert.match(documentDisplayName(second, documents), / · 2번째 등록$/u)
})

test('uses a clear fallback when a duplicate has an invalid creation time', () => {
  const invalidDate = { ...document, created_at: 'invalid' }
  const duplicate = { ...document, id: 'doc-b' }
  assert.equal(documentDisplayName(invalidDate, [invalidDate, duplicate]), '회의록.docx · 등록 시각 확인 필요 · 1번째 등록')
})

test('uses the stored display name for a known result and its original name as fallback', () => {
  const duplicate = { ...document, id: 'doc-b' }
  assert.match(displayDocumentName([document, duplicate], document.id, '기본 이름'), /^회의록\.docx · /u)
  assert.equal(displayDocumentName([document], 'deleted-doc', '예전 파일명.docx'), '예전 파일명.docx')
})
