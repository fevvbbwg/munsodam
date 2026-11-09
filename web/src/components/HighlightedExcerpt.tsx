import { highlightedTextParts } from '../highlightText.mjs'

export default function HighlightedExcerpt({ text, query }: { text: string; query: string }) {
  return <>{highlightedTextParts(text, query).map((part, index) => part.highlighted
    ? <mark key={`${index}:${part.text}`}>{part.text}</mark>
    : part.text,
  )}</>
}
