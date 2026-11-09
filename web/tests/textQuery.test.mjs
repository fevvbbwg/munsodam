import test from 'node:test'
import assert from 'node:assert/strict'
import { createTextQueryMatcher, matchesTextQuery } from '../src/textQuery.mjs'

test('matches every query term across the combined document text', () => {
  assert.equal(matchesTextQuery(['HR 운영 지침.pdf'], '운영 HR'), true)
  assert.equal(matchesTextQuery(['HR 운영 지침.pdf'], 'HR 비용'), false)
})

test('normalizes full-width text and letter case', () => {
  assert.equal(matchesTextQuery(['HR-01 정책 문서'], 'ｈｒ 정책'), true)
})

test('treats blank and punctuation-only queries as no filter', () => {
  assert.equal(matchesTextQuery(['문서 A'], '   '), true)
  assert.equal(matchesTextQuery(['문서 A'], '---'), true)
})

test('matches terms across separate evidence fields', () => {
  assert.equal(matchesTextQuery(['휴가 규정.pdf', '신청 마감', '매월 15일까지'], '규정 15일'), true)
})

test('reuses one compiled matcher over a list without changing match behavior', () => {
  const matchesName = createTextQueryMatcher('HR 정책')
  assert.equal(matchesName(['HR 정책 2026.pdf']), true)
  assert.equal(matchesName(['HR 안내.pdf']), false)
  assert.equal(matchesName(['정책 안내.txt']), false)
})
