import test from 'node:test'
import assert from 'node:assert/strict'
import { formatSavedEvidenceDate } from '../src/savedEvidenceDate.mjs'

test('includes the saved time for an item from the current year', () => {
  const now = new Date('2026-11-03T12:00:00+09:00')
  const label = formatSavedEvidenceDate(new Date('2026-11-03T09:05:00+09:00'), now)
  assert.match(label, /11/u)
  assert.match(label, /오전|오후/u)
  assert.match(label, /5/u)
})

test('includes the year for older saved evidence', () => {
  const now = new Date('2026-11-03T12:00:00+09:00')
  const label = formatSavedEvidenceDate(new Date('2025-06-12T16:40:00+09:00'), now)
  assert.match(label, /25/u)
  assert.match(label, /오전|오후/u)
})

test('reports an invalid saved timestamp clearly', () => {
  assert.equal(formatSavedEvidenceDate('not-a-date'), '날짜 확인 필요')
})
