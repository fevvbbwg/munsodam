/** Compile a normalized all-terms matcher for reuse across a result list. */
export function createTextQueryMatcher(query) {
  const terms = query.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  return values => {
    if (terms.length === 0) return true
    const content = values.join('\n').normalize('NFKC').toLocaleLowerCase()
    return terms.every(term => content.includes(term))
  }
}

/** Match every non-empty search term against the combined visible text. */
export function matchesTextQuery(values, query) {
  return createTextQueryMatcher(query)(values)
}
