import { ArrowRight, FileText, Search } from 'lucide-react'
import { getDocumentChunkSummary } from '../documentStatus'
import type { Doc } from '../types'

function documentAddedDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date)
    : '등록일 미상'
}

export default function ContinueFromDocuments({
  documents,
  busy,
  documentNameFor,
  onAskAboutDocument,
  onSearch,
  title,
  eyebrow = '바로 이어서',
  ariaLabel = title,
}: {
  documents: Doc[]
  busy: boolean
  documentNameFor: (document: Doc) => string
  onAskAboutDocument: (document: Doc) => void
  onSearch: () => void
  title: string
  eyebrow?: string
  ariaLabel?: string
}) {
  if (documents.length === 0) return null

  return <section className="continue-documents" aria-label={ariaLabel}>
    <div className="continue-documents-heading">
      <div><span className="section-overline">{eyebrow}</span><h2>{title}</h2></div>
      <button className="plain-link" type="button" onClick={onSearch}>전체 문서 검색 <ArrowRight size={13}/></button>
    </div>
    <ul className="continue-documents-list">{documents.slice(0, 3).map(document => {
      const documentName = documentNameFor(document)
      return <li key={document.id}><button className="continue-document" type="button" disabled={busy} onClick={() => onAskAboutDocument(document)} aria-label={`${documentName}에서 질문하기`}>
        <span className={`file-icon file-${document.file_type}`}><FileText size={16}/></span>
        <span className="continue-document-copy"><strong title={documentName}>{documentName}</strong><small>{document.file_type.toUpperCase()} · {getDocumentChunkSummary(document)}</small><small>등록일 · {documentAddedDate(document.created_at)}</small></span>
        <span className="continue-document-action"><Search size={13}/> 질문하기</span>
      </button></li>
    })}</ul>
  </section>
}
