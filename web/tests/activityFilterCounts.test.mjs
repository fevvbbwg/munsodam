import test from 'node:test'
import assert from 'node:assert/strict'
import { countActivityViews } from '../src/activityFilterCounts.mjs'

const items = [
  { query: '출장 정산', mode: 'hybrid', view: 'results', scopeLabel: '전체 문서' },
  { query: '출장비 기준', mode: 'keyword', view: 'answer', scopeLabel: 'EXP-01.txt' },
  { query: '휴가 신청', mode: 'hybrid', view: 'answer', scopeLabel: 'HR-01.txt' },
]

test('counts activity types within the active mode and text filters', () => {
  assert.deepEqual(countActivityViews(items, '출장', 'hybrid'), {
    all: 1,
    results: 1,
    answer: 0,
  })
})

test('reports all matching types when no filters are active', () => {
  assert.deepEqual(countActivityViews(items, '', 'all'), {
    all: 3,
    results: 1,
    answer: 2,
  })
})

test('returns zero counts when no activity matches', () => {
  assert.deepEqual(countActivityViews(items, '없는 기록', 'keyword'), {
    all: 0,
    results: 0,
    answer: 0,
  })
})
