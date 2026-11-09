import { ArrowRight, MessageSquareText, Pencil, RotateCw, Search, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createTextQueryMatcher } from '../textQuery.mjs'
import { countActivityViews } from '../activityFilterCounts.mjs'
import { shouldClearSearchOnEscape } from '../keyboardInput.mjs'
import type { Doc } from '../types'
import ContinueFromDocuments from './ContinueFromDocuments'

export type ActivityItem = {
  query: string
  mode: 'vector' | 'keyword' | 'hybrid'
  view: 'results' | 'answer'
  documentId: string | null
  scopeLabel: string
  createdAt?: number
}

export type ActivityFilters = {
  query: string
  viewFilter: 'all' | ActivityItem['view']
  modeFilter: 'all' | ActivityItem['mode']
}

const EMPTY_FILTERS: ActivityFilters = { query: '', viewFilter: 'all', modeFilter: 'all' }

type ActivityGroup = { key: string; label: string; items: ActivityItem[] }

function activityDate(item: ActivityItem) {
  if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) return null
  const date = new Date(item.createdAt)
  return Number.isFinite(date.getTime()) ? date : null
}

function activityQueryLabel(query: string, maxLength = 80) {
  const normalized = query.replace(/\s+/gu, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function groupActivityItems(items: ActivityItem[], now = new Date()): ActivityGroup[] {
  const today = localDateKey(now)
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yesterday = localDateKey(yesterdayDate)
  const groups = new Map<string, ActivityGroup>()

  for (const item of items) {
    const date = activityDate(item)
    const key = date ? localDateKey(date) : 'unknown'
    let group = groups.get(key)
    if (!group) {
      const label = key === today ? '오늘' : key === yesterday ? '어제' : date
        ? new Intl.DateTimeFormat('ko-KR', { year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric', month: 'long', day: 'numeric' }).format(date)
        : '날짜 정보 없음'
      group = { key, label, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
}

export default function ActivityPage({
  items, filters, onFiltersChange, busy, storageMode, canRepeat, onRepeat, onEdit, onRemove, onClear, onRestore, onSearch,
  suggestedDocuments, documentNameFor, onAskAboutDocument,
}: {
  items: ActivityItem[]
  filters: ActivityFilters
  onFiltersChange: (filters: ActivityFilters) => void
  busy: boolean
  storageMode: 'checking' | 'persistent' | 'session' | 'memory'
  canRepeat: (item: ActivityItem) => boolean
  onRepeat: (item: ActivityItem) => void
  onEdit: (item: ActivityItem) => void
  onRemove: (item: ActivityItem) => void
  onClear: () => void
  onRestore: (items: ActivityItem[]) => void
  onSearch: () => void
  suggestedDocuments: Doc[]
  documentNameFor: (document: Doc) => string
  onAskAboutDocument: (document: Doc) => void
}) {
  const { query, viewFilter, modeFilter } = filters
  const viewCounts = countActivityViews(items, query, modeFilter)
  const viewOptions = [
    { value: 'all', label: '전체', count: viewCounts.all },
    { value: 'results', label: '문서 검색', count: viewCounts.results },
    { value: 'answer', label: '답변 요청', count: viewCounts.answer },
  ] as const
  const matchesQuery = createTextQueryMatcher(query)
  const filteredItems = items.filter(item => (viewFilter === 'all' || item.view === viewFilter)
    && (modeFilter === 'all' || item.mode === modeFilter)
    && matchesQuery([item.query, item.scopeLabel]))
  const groups = groupActivityItems(filteredItems)
  const activeFilterLabels = [
    query.trim() ? `검색어 “${query.trim().slice(0, 32)}${query.trim().length > 32 ? '…' : ''}”` : '',
    viewFilter === 'answer' ? '답변 요청' : viewFilter === 'results' ? '문서 검색' : '',
    modeFilter === 'hybrid' ? '함께 찾기' : modeFilter === 'vector' ? '비슷한 내용' : modeFilter === 'keyword' ? '정확한 단어' : '',
  ].filter(Boolean)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [announcement, setAnnouncement] = useState('')
  const [removedItems, setRemovedItems] = useState<ActivityItem[] | null>(null)
  const [removedCount, setRemovedCount] = useState(0)
  useEffect(() => {
    if (!removedItems) return
    const timer = window.setTimeout(() => setRemovedItems(null), 8000)
    return () => window.clearTimeout(timer)
  }, [removedItems])
  const storageStatus = {
    checking: null,
    persistent: ['이 브라우저에 보관', '검색 기록은 이 브라우저에 저장되며 서버에는 보관하지 않습니다.'] as const,
    session: ['현재 탭에서만 보관', '브라우저 저장을 사용할 수 없어 검색 기록은 현재 탭을 닫으면 사라집니다.'] as const,
    memory: ['새로고침하면 기록 삭제', '브라우저 저장 공간을 사용할 수 없어 페이지를 새로고침하면 검색 기록이 사라집니다.'] as const,
  }[storageMode]

  function resetFilters() {
    onFiltersChange(EMPTY_FILTERS)
    setAnnouncement('검색 기록 조건을 초기화했습니다.')
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  function changeQuery(nextQuery: string) {
    onFiltersChange({ ...filters, query: nextQuery })
  }

  function removeItem(event: MouseEvent<HTMLButtonElement>, item: ActivityItem) {
    const groupList = event.currentTarget.closest('.activity-groups')
    const removeButtons = Array.from(groupList?.querySelectorAll<HTMLButtonElement>('.activity-remove') ?? [])
    const currentIndex = removeButtons.indexOf(event.currentTarget)
    const focusTarget = removeButtons[currentIndex + 1] ?? removeButtons[currentIndex - 1]
    setRemovedItems(items)
    setRemovedCount(1)
    onRemove(item)
    if (items.length === 1) onFiltersChange(EMPTY_FILTERS)
    setAnnouncement(`검색 기록 “${item.query.slice(0, 60)}${item.query.length > 60 ? '…' : ''}”을 삭제했습니다.`)
    window.requestAnimationFrame(() => {
      if (focusTarget?.isConnected) focusTarget.focus()
      else listHeadingRef.current?.focus()
    })
  }

  function clearItems() {
    setRemovedItems(items)
    setRemovedCount(items.length)
    onClear()
    onFiltersChange(EMPTY_FILTERS)
    setAnnouncement('검색 기록을 모두 지웠습니다.')
    window.requestAnimationFrame(() => listHeadingRef.current?.focus())
  }

  function undoRemoval() {
    if (!removedItems?.length) return
    const restored = removedItems
    onRestore(restored)
    setRemovedItems(null)
    const count = removedCount
    setRemovedCount(0)
    setAnnouncement(count === 1 ? '삭제한 검색 기록을 복원했습니다.' : `${count}개의 검색 기록을 복원했습니다.`)
    window.requestAnimationFrame(() => listHeadingRef.current?.focus())
  }

  return <section className="secondary-page activity-page">
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    <div className="secondary-page-heading">
      <div><span className="page-kicker">이용 기록</span><h1 tabIndex={-1}>검색 기록</h1><p>이 브라우저에서 실행한 검색과 답변 요청을 다시 이어갈 수 있어요.</p></div>
      {items.length > 0 && <button className="button-secondary activity-clear" type="button" onClick={clearItems}><Trash2 size={14}/> 기록 지우기</button>}
    </div>
    <div className="activity-list-heading"><div><h2 ref={listHeadingRef} tabIndex={-1}>최근 기록</h2>{storageStatus && <span role="status" aria-live="polite" aria-label={storageStatus[1]} title={storageStatus[1]}>{storageStatus[0]}</span>}</div><button type="button" className="plain-link" disabled={busy} onClick={onSearch}>새로 검색하기 <ArrowRight size={14}/></button></div>
    {removedItems && <div className="activity-undo" role="group" aria-label="삭제한 검색 기록 복구">
      <span>{removedCount === 1 ? '검색 기록을 삭제했습니다.' : `${removedCount}개의 검색 기록을 지웠습니다.`}</span>
      <button type="button" onClick={undoRemoval}><RotateCw size={13}/> 실행 취소</button>
    </div>}
    {items.length === 0 ? <>
      <div className="activity-empty"><span><Search size={20}/></span><h2>아직 검색 기록이 없어요</h2><p>문서를 검색하거나 답변을 요청하면 이곳에서 다시 실행할 수 있습니다.</p><button className="button-primary" type="button" disabled={busy} onClick={onSearch}>문서 검색하기 <ArrowRight size={14}/></button></div>
      <ContinueFromDocuments documents={suggestedDocuments} busy={busy} documentNameFor={documentNameFor} onAskAboutDocument={onAskAboutDocument} onSearch={onSearch} title="최근 문서에서 질문하기" ariaLabel="최근 문서에서 검색 이어가기" />
    </> : <>
      <div className="activity-view-filters" role="group" aria-label="검색 기록 유형">
        {viewOptions.map(option => <button type="button" key={option.value} aria-pressed={viewFilter === option.value}
          onClick={() => onFiltersChange({ ...filters, viewFilter: option.value })}>
          {option.label} <span>{option.count}</span>
        </button>)}
      </div>
      <div className="activity-toolbar">
        <label className="activity-search"><Search size={15} aria-hidden="true"/><input ref={searchInputRef} value={query} onKeyDown={event => {
          if (shouldClearSearchOnEscape(event.nativeEvent, Boolean(query))) {
            event.preventDefault()
            changeQuery('')
          }
        }} onChange={event => changeQuery(event.target.value)} placeholder="질문이나 문서 이름 찾기" aria-label="검색 기록에서 질문이나 문서 이름 찾기"/>{query && <button type="button" onClick={() => { changeQuery(''); searchInputRef.current?.focus() }} aria-label="검색 기록 검색어 지우기" title="검색어 지우기"><X size={14}/></button>}</label>
        <select value={modeFilter} onChange={event => onFiltersChange({ ...filters, modeFilter: event.target.value as ActivityFilters['modeFilter'] })} aria-label="검색 기록 검색 방식">
          <option value="all">모든 검색 방식</option><option value="hybrid">함께 찾기</option><option value="vector">비슷한 내용</option><option value="keyword">정확한 단어</option>
        </select>
        {activeFilterLabels.length > 0 && filteredItems.length > 0 && <button type="button" className="activity-filter-reset" onClick={resetFilters}>조건 초기화</button>}
        <span role="status" aria-live="polite">{filteredItems.length} / {items.length}건</span>
      </div>
      {filteredItems.length === 0 ? <div className="activity-empty activity-filter-empty">
        <span><Search size={18}/></span><h2 role="status" aria-live="polite">조건에 맞는 기록이 없어요</h2><p>{activeFilterLabels.length > 0 ? `적용한 조건 · ${activeFilterLabels.join(' · ')}` : '질문 문구를 줄이거나 검색 조건을 바꿔보세요.'}</p>
        <button className="button-secondary" type="button" onClick={resetFilters}>조건 초기화</button>
      </div> : <div className="activity-groups">
      {groups.map(group => <section className="activity-group" key={group.key} aria-labelledby={`activity-day-${group.key}`}>
        <h3 id={`activity-day-${group.key}`}>{group.label}<span>{group.items.length}</span></h3>
        <ol className="activity-list">
      {group.items.map((item, index) => {
        const repeatable = canRepeat(item)
        const fallbackScopeReason = item.scopeLabel === '삭제된 문서'
          ? '삭제된 문서'
          : item.scopeLabel.endsWith(' · 준비 중')
            ? '아직 처리 중인 문서'
            : item.scopeLabel.endsWith(' · 읽기 실패')
              ? '읽기에 실패한 문서'
              : item.scopeLabel.endsWith(' · 다시 처리 필요')
                ? '검색 준비가 필요한 문서'
                : null
        const scopeWillFallback = Boolean(item.documentId && fallbackScopeReason && repeatable)
        const modeLabel = item.mode === 'keyword' ? '정확한 단어' : item.mode === 'vector' ? '비슷한 내용' : '함께 찾기'
        const date = activityDate(item)
        const createdLabel = date
          ? new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(date)
          : null
        return <li key={`${item.documentId ?? 'all'}:${item.mode}:${item.view}:${item.query}:${index}`}>
          <span className={`activity-kind ${item.view === 'answer' ? 'answer' : ''}`}>{item.view === 'answer' ? <MessageSquareText size={15}/> : <Search size={15}/>}</span>
          <div className="activity-copy">
            <button type="button" className="activity-edit" aria-label={`질문 수정: ${activityQueryLabel(item.query)}`} title={item.query} disabled={busy} onClick={() => onEdit(item)}>
              <span>{item.query}</span><Pencil size={12} aria-hidden="true"/>
            </button>
            <span><span>{item.view === 'answer' ? '답변 요청' : modeLabel}</span><i aria-hidden="true"/><span>{item.scopeLabel}</span>{scopeWillFallback && <><i aria-hidden="true"/><span>전체 문서로 다시 찾기</span></>}{createdLabel && <><i aria-hidden="true"/><span>{createdLabel}</span></>}</span>
          </div>
          <button type="button" className="activity-repeat" aria-label={`${scopeWillFallback ? '전체 문서에서 ' : ''}검색 다시 실행: ${activityQueryLabel(item.query)}`} disabled={busy || !repeatable} onClick={() => onRepeat(item)} title={!repeatable ? '문서와 검색 기능을 확인한 뒤 다시 실행할 수 있어요.' : scopeWillFallback ? `${fallbackScopeReason}이므로 전체 문서 범위에서 다시 찾습니다.` : '이 질문 다시 실행'}><RotateCw size={14}/><span>{scopeWillFallback ? '전체에서 찾기' : '다시 실행'}</span></button>
          <button type="button" className="activity-remove" onClick={event => removeItem(event, item)} aria-label={`검색 기록 삭제: ${activityQueryLabel(item.query)}`} title="이 기록만 삭제"><Trash2 size={14}/></button>
        </li>
      })}
        </ol>
      </section>)}
      </div>}
    </>}
  </section>
}
