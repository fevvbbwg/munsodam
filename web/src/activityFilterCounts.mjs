import { createTextQueryMatcher } from './textQuery.mjs'

export function countActivityViews(items, query, modeFilter) {
  const matchesQuery = createTextQueryMatcher(query)
  const matchingItems = items.filter(item => (modeFilter === 'all' || item.mode === modeFilter)
    && matchesQuery([item.query, item.scopeLabel]))
  const answers = matchingItems.filter(item => item.view === 'answer').length
  return {
    all: matchingItems.length,
    results: matchingItems.length - answers,
    answer: answers,
  }
}
