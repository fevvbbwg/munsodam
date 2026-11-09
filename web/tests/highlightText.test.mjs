import test from 'node:test'
import assert from 'node:assert/strict'
import { highlightedTextParts } from '../src/highlightText.mjs'

test('marks each distinct query term while preserving punctuation and spacing', () => {
  assert.deepEqual(
    highlightedTextParts('출장 비용은 7일 안에 정산한다.', '출장 정산?'),
    [
      { text: '출장', highlighted: true },
      { text: ' 비용은 7일 안에 ', highlighted: false },
      { text: '정산', highlighted: true },
      { text: '한다.', highlighted: false },
    ],
  )
})

test('matches longer terms before their contained shorter terms', () => {
  assert.deepEqual(
    highlightedTextParts('정산서 작성 후 정산한다.', '정산서 정산'),
    [
      { text: '정산서', highlighted: true },
      { text: ' 작성 후 ', highlighted: false },
      { text: '정산', highlighted: true },
      { text: '한다.', highlighted: false },
    ],
  )
})

test('ignores one-character terms and preserves unhighlighted text', () => {
  assert.deepEqual(highlightedTextParts('AI 문서', 'x'), [{ text: 'AI 문서', highlighted: false }])
})
