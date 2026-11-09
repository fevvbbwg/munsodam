import { ArrowRight, ArrowUpRight, Bookmark, ChevronLeft, ChevronRight, Copy, Download, FileText, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import type { SavedEvidence, SearchResult } from '../types'
import { createTextQueryMatcher } from '../textQuery.mjs'
import { documentUrl, isPlainLeftClick } from '../documentLinks.mjs'
import { downloadMarkdown, localDateStamp, markdownQuote, markdownText } from '../markdownExport.mjs'
import HighlightedExcerpt from './HighlightedExcerpt'
import { formatSavedEvidenceDate } from '../savedEvidenceDate.mjs'
import { shouldClearSearchOnEscape } from '../keyboardInput.mjs'
import type { Doc } from '../types'
import ContinueFromDocuments from './ContinueFromDocuments'
import EvidenceContext from './EvidenceContext'

const SAVED_EVIDENCE_PAGE_SIZE = 20

export type SavedEvidenceView = {
  query: string
  documentId: string | null
  sortOrder: 'newest' | 'oldest' | 'filename'
  page: number
}

export default function SavedEvidencePage({
  items, copyStatus, storageWarning, documentNameFor, sourceAvailabilityFor, onOpen, onRemove, onRestore, onCopy, onBrowse, onSearch,
  suggestedDocuments, busy, onAskAboutDocument, onReuseQuestion, view, onViewChange,
}: {
  suggestedDocuments: Doc[]
  busy: boolean
  onAskAboutDocument: (document: Doc) => void
  onReuseQuestion: (query: string) => void
  items: SavedEvidence[]
  documentNameFor: (documentId: string, filename: string) => string
  sourceAvailabilityFor: (documentId: string) => boolean | null
  copyStatus: { id: string; message: string } | null
  storageWarning: boolean
  onOpen: (source: SearchResult) => void
  onRemove: (chunkId: string) => void
  onRestore: (item: SavedEvidence) => void
  onCopy: (source: SearchResult) => void
  onBrowse: () => void
  onSearch: () => void
  view: SavedEvidenceView
  onViewChange: Dispatch<SetStateAction<SavedEvidenceView>>
}) {
  const { query, documentId, sortOrder, page: currentPage } = view
  const [expandedQueryIds, setExpandedQueryIds] = useState<Set<string>>(() => new Set())
  const [announcement, setAnnouncement] = useState('')
  const [removedEvidence, setRemovedEvidence] = useState<SavedEvidence | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const savedEvidenceListRef = useRef<HTMLDivElement>(null)
  const pendingRestoredEvidenceRef = useRef<string | null>(null)
  const sourceDocuments = useMemo(() => {
    const groups = new Map<string, { filename: string; count: number }>()
    for (const item of items) {
      const group = groups.get(item.document_id)
      if (group) group.count += 1
      else groups.set(item.document_id, { filename: item.filename, count: 1 })
    }
    return groups
  }, [items])
  const documentOptions = Array.from(sourceDocuments, ([id, { filename, count }]) => ({
    id,
    label: documentNameFor(id, filename),
    count,
  })).sort((left, right) => left.label.localeCompare(right.label, 'ko'))
  const selectedDocument = documentOptions.find(option => option.id === documentId)
  const activeDocumentId = selectedDocument?.id ?? null
  const visibleItems = useMemo(() => {
    const matchesEvidence = createTextQueryMatcher(query)
    return items
      .filter(item => (!activeDocumentId || item.document_id === activeDocumentId) && matchesEvidence([
        item.filename,
        item.section_path ?? '',
        item.page_number ? `페이지 ${item.page_number} p ${item.page_number}` : '',
        `구간 ${item.chunk_index + 1}`,
        item.query,
        item.excerpt,
      ]))
      .sort((left, right) => sortOrder === 'filename'
        ? left.filename.localeCompare(right.filename, 'ko') || right.saved_at - left.saved_at
        : sortOrder === 'oldest'
          ? left.saved_at - right.saved_at
          : right.saved_at - left.saved_at)
  }, [items, activeDocumentId, query, sortOrder])
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / SAVED_EVIDENCE_PAGE_SIZE))
  const activePage = Math.min(currentPage, pageCount)
  const firstVisibleItem = visibleItems.length ? (activePage - 1) * SAVED_EVIDENCE_PAGE_SIZE + 1 : 0
  const lastVisibleItem = Math.min(activePage * SAVED_EVIDENCE_PAGE_SIZE, visibleItems.length)
  const pagedItems = visibleItems.slice(firstVisibleItem - 1, lastVisibleItem)

  useEffect(() => {
    if (currentPage > pageCount) onViewChange(current => ({ ...current, page: Math.min(current.page, pageCount) }))
  }, [currentPage, pageCount, onViewChange])

  useEffect(() => {
    if (documentId && !activeDocumentId) {
      onViewChange(current => current.documentId === documentId ? { ...current, documentId: null, page: 1 } : current)
    }
  }, [documentId, activeDocumentId, onViewChange])

  useEffect(() => {
    const restoredId = pendingRestoredEvidenceRef.current
    if (!restoredId || removedEvidence) return
    const restoredIndex = visibleItems.findIndex(item => item.chunk_id === restoredId)
    if (restoredIndex < 0) {
      pendingRestoredEvidenceRef.current = null
      headingRef.current?.focus()
      return
    }
    const restoredPage = Math.floor(restoredIndex / SAVED_EVIDENCE_PAGE_SIZE) + 1
    if (activePage !== restoredPage) {
      onViewChange(current => ({ ...current, page: restoredPage }))
      return
    }
    const frame = window.requestAnimationFrame(() => {
      pendingRestoredEvidenceRef.current = null
      const card = document.getElementById(`saved-evidence-${restoredId}`)
      const target = card?.querySelector<HTMLElement>('.saved-evidence-card-heading a, .saved-evidence-remove') ?? headingRef.current
      target?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activePage, onViewChange, removedEvidence, visibleItems])

  useEffect(() => {
    if (!removedEvidence) return
    const timer = window.setTimeout(() => setRemovedEvidence(null), 8000)
    return () => window.clearTimeout(timer)
  }, [removedEvidence])

  function changeQuery(nextQuery: string) {
    onViewChange(current => ({ ...current, query: nextQuery, page: 1 }))
  }

  function downloadVisibleItems() {
    if (visibleItems.length === 0) return
    const markdown = [
      '# 문서담 · 저장한 근거',
      '',
      `내보낸 날짜: ${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date())}`,
      `항목 수: ${visibleItems.length}개`,
      ...(selectedDocument ? [`문서: ${markdownText(selectedDocument.label)}`] : []),
      ...(query.trim() ? [`검색어: ${markdownText(query.trim())}`] : []),
      '',
      ...visibleItems.flatMap((item, index) => {
        const location = item.page_number ? `p. ${item.page_number}` : item.section_path || `구간 ${item.chunk_index + 1}`
        const href = `${window.location.origin}${documentUrl(item.document_id, item.chunk_index)}`
        const sourceLine = sourceAvailabilityFor(item.document_id) === false
          ? '- 원문: 문서가 삭제되어 열 수 없습니다.'
          : `- 원문: [문서에서 열기](${href})`
        const excerpt = markdownQuote(item.excerpt)
        return [
          `## ${index + 1}. ${markdownText(documentNameFor(item.document_id, item.filename))}`,
          '',
          `- 위치: ${markdownText(location)}`,
          `- 저장한 질문: ${markdownText(item.query.replace(/\s+/gu, ' '))}`,
          `- 저장한 시각: ${formatSavedEvidenceDate(item.saved_at)}`,
          sourceLine,
          '',
          excerpt,
          '',
        ]
      }),
    ].join('\n')
    downloadMarkdown(markdown, `문서담-저장한-근거-${localDateStamp(new Date())}.md`)
    setAnnouncement(`${visibleItems.length}개의 저장한 근거 내보내기를 시작했습니다.`)
  }

  function removeItem(event: MouseEvent<HTMLButtonElement>, item: SavedEvidence) {
    const card = event.currentTarget.closest('.saved-evidence-card')
    const nextRemoveButton = card?.nextElementSibling?.querySelector<HTMLButtonElement>('.saved-evidence-remove')
      ?? card?.previousElementSibling?.querySelector<HTMLButtonElement>('.saved-evidence-remove')
    setRemovedEvidence(item)
    setExpandedQueryIds(current => {
      if (!current.has(item.chunk_id)) return current
      const next = new Set(current)
      next.delete(item.chunk_id)
      return next
    })
    onRemove(item.chunk_id)
    const documentName = documentNameFor(item.document_id, item.filename)
    const filename = documentName.slice(0, 60)
    setAnnouncement(`“${filename}${documentName.length > 60 ? '…' : ''}”의 근거를 저장 목록에서 삭제했습니다.`)
    window.requestAnimationFrame(() => {
      const remainingRemoveButton = nextRemoveButton?.isConnected
        ? nextRemoveButton
        : savedEvidenceListRef.current?.querySelector<HTMLButtonElement>('.saved-evidence-remove')
      if (remainingRemoveButton?.isConnected) remainingRemoveButton.focus()
      else headingRef.current?.focus()
    })
  }

  function undoRemove() {
    if (!removedEvidence) return
    const restored = removedEvidence
    pendingRestoredEvidenceRef.current = restored.chunk_id
    onRestore(restored)
    setRemovedEvidence(null)
    const documentName = documentNameFor(restored.document_id, restored.filename).slice(0, 60)
    setAnnouncement(`“${documentName}”의 저장한 근거를 복원했습니다.`)
  }

  return <section className="secondary-page saved-evidence-page">
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    <div className="secondary-page-heading">
      <div><span className="page-kicker">근거 보관</span><h1 ref={headingRef} tabIndex={-1}>저장한 근거</h1><p>다시 확인할 문장과 원문 위치를 모아두세요.</p></div>
      {items.length > 0 && <span className="saved-evidence-count"><Bookmark size={14}/>{items.length} <span>/ 200개</span></span>}
    </div>
    <p className={`saved-evidence-privacy ${storageWarning ? 'warning' : ''}`} role={storageWarning ? 'status' : undefined}>
      <Bookmark size={14}/>{storageWarning ? '브라우저 저장 공간을 사용할 수 없어 변경 사항은 이 페이지에만 임시 보관됩니다. 새로고침하거나 브라우저를 닫으면 사라질 수 있어요.' : '저장한 발췌는 이 브라우저에만 보관됩니다.'}
    </p>
    {removedEvidence && <div className="saved-evidence-undo" role="group" aria-label="삭제한 근거 복구">
      <span>“{documentNameFor(removedEvidence.document_id, removedEvidence.filename)}”의 근거를 삭제했습니다.</span>
      <button type="button" onClick={undoRemove}><RotateCcw size={13}/> 실행 취소</button>
    </div>}
    {items.length === 0 ? <>
      <div className="activity-empty saved-evidence-empty">
        <span><Bookmark size={20}/></span><h2>아직 저장한 근거가 없어요</h2>
        <p>검색 결과나 답변 아래의 저장 버튼을 누르면 원문 발췌를 다시 볼 수 있습니다.</p>
        <div><button className="button-primary" type="button" onClick={onSearch}>문서 검색하기 <Search size={14}/></button><button className="button-secondary" type="button" onClick={onBrowse}>문서함 둘러보기 <ArrowRight size={14}/></button></div>
      </div>
      <ContinueFromDocuments documents={suggestedDocuments} busy={busy} documentNameFor={document => documentNameFor(document.id, document.filename)} onAskAboutDocument={onAskAboutDocument} onSearch={onSearch} title="저장할 근거 찾아보기" eyebrow="근거 만들기" ariaLabel="최근 문서에서 저장할 근거 찾아보기" />
    </> : <>
      <div className="saved-evidence-toolbar">
        <label><Search size={16} aria-hidden="true"/><input ref={searchInputRef} value={query} onKeyDown={event => {
          if (shouldClearSearchOnEscape(event.nativeEvent, Boolean(query))) {
            event.preventDefault()
            changeQuery('')
          }
        }} onChange={event => changeQuery(event.target.value)} placeholder="문서·위치·질문·발췌에서 찾기" aria-label="저장한 근거 검색"/>{query && <button type="button" onClick={() => {
          changeQuery('')
          searchInputRef.current?.focus()
        }} aria-label="검색어 지우기" title="검색어 지우기"><X size={14}/></button>}</label>
        <div className="saved-evidence-toolbar-actions">
          {(documentOptions.length > 1 || activeDocumentId) && <select className="saved-evidence-document-filter" value={activeDocumentId ?? ''} onChange={event => {
            const nextDocumentId = event.target.value || null
            onViewChange(current => ({ ...current, documentId: nextDocumentId, page: 1 }))
          }} aria-label="저장 근거 문서 필터" title={selectedDocument?.label ?? '전체 문서'}>
            <option value="">전체 문서</option>
            {documentOptions.map(option => <option key={option.id} value={option.id}>{option.label} · {option.count}개</option>)}
          </select>}
          <span role="status" aria-live="polite" aria-atomic="true">{visibleItems.length} / {items.length}개</span>
          <select value={sortOrder} onChange={event => {
            const nextSortOrder = event.target.value as SavedEvidenceView['sortOrder']
            onViewChange(current => ({ ...current, sortOrder: nextSortOrder, page: 1 }))
          }} aria-label="저장 근거 정렬">
            <option value="newest">최근 저장순</option><option value="oldest">오래된 순</option><option value="filename">문서명순</option>
          </select>
          <button type="button" onClick={downloadVisibleItems} disabled={visibleItems.length === 0} title="선택한 문서와 검색 조건에 맞는 근거를 Markdown으로 내려받습니다."><Download size={14}/> 내보내기</button>
        </div>
      </div>
      {visibleItems.length === 0 ? <div className={'activity-empty saved-evidence-empty no-actions' + (query.trim() ? ' has-query' : '')}>
        <span><Search size={20}/></span><h2 role="status" aria-live="polite">일치하는 근거가 없어요</h2><p>{selectedDocument ? '선택한 문서의 저장 근거에서 검색어와 일치하는 항목이 없어요. 검색어를 바꾸거나 전체 문서에서 찾아보세요.' : `검색어 “${query.trim().slice(0, 48)}${query.trim().length > 48 ? '…' : ''}”에 해당하는 저장 근거가 없어요. 검색어를 줄여 보세요.`}</p>
        {query.trim() && <button className="button-secondary" type="button" onClick={() => {
          changeQuery('')
          setAnnouncement(selectedDocument ? '검색어를 지웠습니다. 선택한 문서의 저장 근거를 표시합니다.' : '검색어를 지웠습니다. 저장한 근거 전체를 표시합니다.')
          window.requestAnimationFrame(() => searchInputRef.current?.focus())
        }}>검색어 지우기</button>}
      </div> : <>
        <div className="saved-evidence-list" ref={savedEvidenceListRef}>
        {pagedItems.map(item => {
          const location = [item.page_number ? `p. ${item.page_number}` : item.section_path, `구간 ${item.chunk_index + 1}`].filter(Boolean).join(' · ')
          const savedDate = formatSavedEvidenceDate(item.saved_at)
          const sourceAvailable = sourceAvailabilityFor(item.document_id)
          const documentName = documentNameFor(item.document_id, item.filename)
          const queryExpanded = expandedQueryIds.has(item.chunk_id)
          const queryId = `saved-evidence-query-${item.chunk_id}`
          const source: SearchResult = item
          const sourceLink = sourceAvailable === false
            ? <span className="saved-evidence-source-name unavailable"><HighlightedExcerpt text={documentName} query={query}/></span>
            : <a id={`saved-evidence-source-${item.chunk_id}`} title={documentName} aria-label={`원문 열기: ${documentName}, ${location}`} href={documentUrl(item.document_id, item.chunk_index)} onClick={event => {
              if (isPlainLeftClick(event)) {
                event.preventDefault()
                event.currentTarget.focus({ preventScroll: true })
                onOpen(source)
              }
            }}><span><HighlightedExcerpt text={documentName} query={query}/></span> <ArrowUpRight size={12}/></a>
          return <article id={`saved-evidence-${item.chunk_id}`} className="saved-evidence-card" key={item.chunk_id}>
            <div className="saved-evidence-card-heading">
              <span className={`file-icon file-${item.filename.split('.').pop()?.toLowerCase() ?? 'txt'}`}><FileText size={16}/></span>
              <div>{sourceLink}<small><HighlightedExcerpt text={location} query={query}/> · {savedDate} 저장</small>{sourceAvailable === false && <small className="saved-evidence-source-missing">원문 문서는 삭제됐어요 · 발췌는 보관 중</small>}</div>
            </div>
            <blockquote><HighlightedExcerpt text={item.excerpt} query={query}/></blockquote>
            <p className="saved-evidence-question"><span>검색 질문</span><span id={queryId} className={`saved-evidence-query${queryExpanded ? ' expanded' : ''}`} title={item.query} aria-hidden={item.query.length > 120 && !queryExpanded}><HighlightedExcerpt text={item.query} query={query}/></span>{item.query.length > 120 && <button className="saved-evidence-query-toggle" type="button" aria-label={queryExpanded ? '저장한 검색 질문 접기' : '저장한 검색 질문 전체 보기'} aria-controls={queryId} aria-expanded={queryExpanded} onClick={() => setExpandedQueryIds(current => {
              const next = new Set(current)
              if (next.has(item.chunk_id)) next.delete(item.chunk_id)
              else next.add(item.chunk_id)
              return next
            })}>{queryExpanded ? '접기' : '더 보기'}</button>}</p>
            <div className="saved-evidence-actions">
              <button type="button" disabled={busy} onClick={() => onReuseQuestion(item.query)}><Pencil size={13} aria-hidden="true"/> 질문 다시 쓰기</button>
              <button type="button" onClick={() => onCopy(source)}><Copy size={13}/> {copyStatus?.id === item.chunk_id && copyStatus.message === '출처와 발췌를 복사했습니다.' ? '복사됨' : '발췌와 출처 복사'}</button>
              <button className="saved-evidence-remove" type="button" onClick={event => removeItem(event, item)} aria-label={`${documentNameFor(item.document_id, item.filename)} 근거 저장 해제`} title="저장한 근거에서 제거"><Trash2 size={14}/> 삭제</button>
            </div>
            {copyStatus?.id === item.chunk_id && <span className={`saved-evidence-copy-status ${copyStatus.message.includes('복사했습니다') ? '' : 'error'}`} role="status" aria-live="polite">{copyStatus.message}</span>}
            {sourceAvailable !== false && <EvidenceContext source={item} query={item.query} documentName={documentName} disclosureKey={`saved-context-${item.chunk_id}`} />}
          </article>
        })}
        </div>
        {pageCount > 1 && <nav className="collection-pagination" aria-label="저장한 근거 페이지 이동">
          <span aria-live="polite" aria-atomic="true">{firstVisibleItem}–{lastVisibleItem} / {visibleItems.length}개</span>
          <div>
            <button type="button" disabled={activePage <= 1} onClick={() => onViewChange(current => ({ ...current, page: activePage - 1 }))}><ChevronLeft size={14}/> 이전</button>
            <strong aria-current="page">{activePage} / {pageCount}</strong>
            <button type="button" disabled={activePage >= pageCount} onClick={() => onViewChange(current => ({ ...current, page: activePage + 1 }))}>다음 <ChevronRight size={14}/></button>
          </div>
        </nav>}
      </>}
    </>}
  </section>
}
