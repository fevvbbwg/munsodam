export function highlightedTextParts(text, query) {
  const terms = [...new Set(query.match(/[0-9]+|[a-z]+|[가-힣]+/giu) ?? [])]
    .filter(term => term.length > 1)
    .sort((left, right) => right.length - left.length)

  if (terms.length === 0) return [{ text, highlighted: false }]

  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'giu')
  return text.split(pattern).filter(Boolean).map(part => ({
    text: part,
    highlighted: terms.some(term => term.toLocaleLowerCase() === part.toLocaleLowerCase()),
  }))
}
