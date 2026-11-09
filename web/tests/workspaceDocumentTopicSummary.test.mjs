import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeWorkspaceTopics } from '../src/workspaceDocumentTopicSummary.mjs'

test('shows topic count and that every document can be asked about', () => {
  assert.equal(summarizeWorkspaceTopics({
    documentCount: 3,
    topicCount: 8,
    loadingCount: 0,
    unavailableCount: 0,
    searchableCount: 3,
  }), '8개 주제 · 모두 질문 가능')
})

test('shows available document count alongside loading and outline failures', () => {
  assert.equal(summarizeWorkspaceTopics({
    documentCount: 4,
    topicCount: 2,
    loadingCount: 1,
    unavailableCount: 1,
    searchableCount: 2,
  }), '2개 주제 · 검색 가능 2/4 · 더 불러오는 중 · 일부 확인 필요')
})

test('explains that documents without topic headings can still be asked about when searchable', () => {
  assert.equal(summarizeWorkspaceTopics({
    documentCount: 2,
    topicCount: 0,
    loadingCount: 0,
    unavailableCount: 0,
    searchableCount: 2,
  }), '문서 전체 질문 가능')
})

test('distinguishes unsearchable documents when no topic headings are available', () => {
  assert.equal(summarizeWorkspaceTopics({
    documentCount: 3,
    topicCount: 0,
    loadingCount: 0,
    unavailableCount: 0,
    searchableCount: 1,
  }), '검색 가능 1/3 · 제목 구분 없이 질문 가능')
})

test('reports when topic retrieval failed for every document', () => {
  assert.equal(summarizeWorkspaceTopics({
    documentCount: 2,
    topicCount: 0,
    loadingCount: 0,
    unavailableCount: 2,
    searchableCount: 1,
  }), '주제 확인 필요 · 검색 가능 1/2')
})
