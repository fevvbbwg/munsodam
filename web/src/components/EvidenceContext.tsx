import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DocDetail, SearchResult } from '../types'
import HighlightedExcerpt from './HighlightedExcerpt'

const API = import.meta.env.VITE_API_URL ?? ''
const CONTEXT_TIMEOUT_MS = 15_000

type Chunk = DocDetail['chunks'][number]
type Preview =
  | { status: 'loading' }
  | { status: 'ready'; chunks: Chunk[] }
  | { status: 'error'; message: string; retryable: boolean }

export default function EvidenceContext({ source, query, documentName, disclosureKey }: {
  source: SearchResult
  query: string
  documentName: string
  disclosureKey: string
}) {
  const { document_id: documentId, chunk_id: chunkId, chunk_index: chunkIndex } = source
  const hasValidChunkIndex = Number.isInteger(chunkIndex) && chunkIndex >= 0
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [preview, setPreview] = useState<Preview>({ status: 'loading' })
  const summaryRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open || !hasValidChunkIndex) return

    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS)
    const offset = Math.max(0, chunkIndex - 1)
    const limit = chunkIndex - offset + 2

    async function loadContext() {
      try {
        const response = await fetch(
          `${API}/api/documents/${encodeURIComponent(documentId)}?offset=${offset}&limit=${limit}`,
          { signal: controller.signal, cache: 'no-store' },
        )
        if (!active) return
        if (response.status === 401) {
          setPreview({ status: 'error', message: '다시 로그인하면 문맥을 확인할 수 있어요.', retryable: false })
          return
        }
        if (response.status === 404) {
          setPreview({ status: 'error', message: '원문 문서를 열 수 없어요.', retryable: false })
          return
        }
        if (!response.ok) throw new Error('Could not load document')

        const detail: DocDetail = await response.json()
        if (!active) return
        if (!Array.isArray(detail.chunks)) throw new Error('Invalid document response')
        const chunks = detail.chunks
          .filter(chunk => Math.abs(chunk.chunk_index - chunkIndex) <= 1)
          .sort((left, right) => left.chunk_index - right.chunk_index)

        if (detail.id !== documentId || !chunks.some(chunk => chunk.chunk_index === chunkIndex && chunk.id === chunkId)) {
          setPreview({
            status: 'error',
            message: '이 근거의 원문 구간이 바뀌었어요. 최신 근거를 보려면 다시 검색해 주세요.',
            retryable: false,
          })
          return
        }
        setPreview({ status: 'ready', chunks })
      } catch {
        if (active) {
          setPreview({ status: 'error', message: '문맥을 불러오지 못했어요.', retryable: true })
        }
      } finally {
        window.clearTimeout(timeout)
      }
    }

    void loadContext()
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [open, attempt, documentId, chunkId, chunkIndex, hasValidChunkIndex])

  if (!hasValidChunkIndex) return null

  return (
    <details
      className="evidence-context"
      data-detail-return-disclosure={disclosureKey}
      onToggle={event => {
        const nextOpen = event.currentTarget.open
        if (nextOpen === open) return
        setPreview({ status: 'loading' })
        setOpen(nextOpen)
      }}
    >
      <summary ref={summaryRef}>
        <ChevronDown size={14} aria-hidden="true" />
        <span className="evidence-context-closed-label">앞뒤 문맥 보기</span>
        <span className="evidence-context-open-label">앞뒤 문맥 접기</span>
        <span className="sr-only"> · {documentName} · 구간 {chunkIndex + 1}</span>
      </summary>
      <div className="evidence-context-body">
        <div role="status" aria-live="polite" aria-atomic="true">
          {preview.status === 'loading' && <p className="evidence-context-message">문서 구간을 불러오는 중…</p>}
          {preview.status === 'error' && <p className="evidence-context-message">{preview.message}</p>}
          {preview.status === 'ready' && <span className="sr-only">원문 구간 {preview.chunks.length}개를 불러왔어요.</span>}
        </div>
        {preview.status === 'error' && preview.retryable && <button type="button" onClick={() => {
          summaryRef.current?.focus()
          setPreview({ status: 'loading' })
          setAttempt(value => value + 1)
        }}>다시 시도</button>}
        {preview.status === 'ready' && <ol className="evidence-context-chunks" aria-label="원문 문맥">
          {preview.chunks.map(chunk => {
            const current = chunk.chunk_index === chunkIndex
            const position = current ? '근거 구간' : chunk.chunk_index < chunkIndex ? '앞 구간' : '뒤 구간'
            const location = [chunk.page_number ? `p. ${chunk.page_number}` : '', chunk.section_path, `구간 ${chunk.chunk_index + 1}`].filter(Boolean).join(' · ')
            return (
              <li className={current ? 'evidence-context-current' : undefined} key={chunk.id}>
                <div className="evidence-context-location"><strong>{position}</strong><span>{location}</span></div>
                <p className="evidence-context-text"><HighlightedExcerpt text={chunk.content} query={query} /></p>
              </li>
            )
          })}
        </ol>}
      </div>
    </details>
  )
}
