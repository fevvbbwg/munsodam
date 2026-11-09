import { ArrowRight, ArrowUpRight, Bookmark, FileText } from 'lucide-react'
import { documentUrl, isPlainLeftClick } from '../documentLinks.mjs'
import type { SavedEvidence, SearchResult } from '../types'
import { formatSavedEvidenceDate } from '../savedEvidenceDate.mjs'

export default function RecentSavedEvidence({
  items, documentNameFor, sourceAvailabilityFor, onOpen, onMore,
}: {
  items: SavedEvidence[]
  documentNameFor: (documentId: string, filename: string) => string
  sourceAvailabilityFor: (documentId: string) => boolean | null
  onOpen: (source: SearchResult) => void
  onMore: () => void
}) {
  if (items.length === 0) return null
  const recent = items.slice().sort((left, right) => right.saved_at - left.saved_at).slice(0, 2)

  return <section className="recent-saved-evidence" aria-labelledby="recent-saved-evidence-title">
    <div className="recent-saved-evidence-heading">
      <div><span className="section-overline"><Bookmark size={12}/> 저장한 근거</span><h2 id="recent-saved-evidence-title">다시 확인할 문장</h2></div>
      <button type="button" onClick={onMore}>모두 보기 <ArrowRight size={13}/></button>
    </div>
    <div className="recent-saved-evidence-grid">
      {recent.map(item => {
        const location = item.page_number ? `p. ${item.page_number}` : item.section_path || `구간 ${item.chunk_index + 1}`
        const querySummary = item.query.replace(/\s+/gu, ' ').trim()
        const excerptSummary = item.excerpt.replace(/\s+/gu, ' ').trim()
        const shortQuery = `${querySummary.slice(0, 100)}${querySummary.length > 100 ? '…' : ''}`
        const shortExcerpt = `${excerptSummary.slice(0, 180)}${excerptSummary.length > 180 ? '…' : ''}`
        const documentName = documentNameFor(item.document_id, item.filename)
        const sourceAvailable = sourceAvailabilityFor(item.document_id)
        const savedDate = formatSavedEvidenceDate(item.saved_at)
        const cardContents = <>
          <span className={`file-icon file-${item.filename.split('.').pop()?.toLowerCase() ?? 'txt'}`}><FileText size={15}/></span>
          <span className="recent-saved-evidence-copy"><strong><span title={documentName}>{documentName}</span></strong><small className="recent-saved-evidence-location" title={location}>{location}</small><small className="recent-saved-evidence-date">저장 · {savedDate}</small>{sourceAvailable === false && <small className="recent-saved-evidence-missing">원문 문서 삭제됨 · 발췌 보관 중</small>}<small className="recent-saved-evidence-query" title={`저장 당시 질문: ${item.query}`}>질문 · {item.query}</small><span title={item.excerpt}>{item.excerpt}</span></span>
          {sourceAvailable !== false && <ArrowUpRight size={14}/>}
        </>
        const className = `recent-saved-evidence-item${sourceAvailable === false ? ' unavailable' : ''}`
        if (sourceAvailable === false) return <div className={className} key={item.chunk_id}>{cardContents}</div>
        return <a id={`recent-saved-evidence-source-${item.chunk_id}`} className={className} key={item.chunk_id} href={documentUrl(item.document_id, item.chunk_index)} aria-label={`${documentName}, ${location}. 질문: ${shortQuery}. 근거 미리 보기: ${shortExcerpt}. 원문 근거 열기`} onClick={event => {
          if (isPlainLeftClick(event)) {
            event.preventDefault()
            event.currentTarget.focus({ preventScroll: true })
            onOpen(item)
          }
        }}>{cardContents}</a>
      })}
    </div>
  </section>
}
