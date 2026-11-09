import { useEffect, useRef } from 'react'
import { AlertTriangle, ArrowRight, X } from 'lucide-react'

type DeleteConfirmDialogProps = {
  documentLabels: string[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function DeleteConfirmDialog({ documentLabels, busy, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }
      if (event.key === 'Tab') {
        event.stopPropagation()
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [])
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first) {
          event.preventDefault()
        } else if (!dialogRef.current?.contains(document.activeElement)) {
          event.preventDefault()
          first.focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [busy, onCancel])

  const isBulk = documentLabels.length > 1

  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-busy={busy} aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-filenames delete-dialog-description">
        <div className="confirm-dialog-icon"><AlertTriangle size={19} /></div>
        <button className="confirm-dialog-close" aria-label="삭제 취소" disabled={busy} onClick={onCancel}><X size={17} /></button>
        <span className="section-overline">{isBulk ? '선택 문서 삭제' : '문서 삭제'}</span>
        <h2 id="delete-dialog-title">{isBulk ? `${documentLabels.length}개 문서를 삭제할까요?` : '이 문서를 삭제할까요?'}</h2>
        <div id="delete-dialog-filenames" className={`confirm-dialog-filename${isBulk ? ' multiple' : ''}`} title={documentLabels.join('\n')}>
          {documentLabels.map((filename, index) => <span key={`${filename}-${index}`}>{filename}</span>)}
        </div>
        <p id="delete-dialog-description">원본 파일과 검색을 위해 추출한 텍스트가 함께 삭제됩니다. 삭제한 문서는 복구할 수 없습니다.</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} className="button-secondary" disabled={busy} onClick={onCancel}>취소</button>
          <button className="button-danger" aria-disabled={busy} onClick={() => { if (!busy) onConfirm() }}>
            {busy ? '삭제 중…' : isBulk ? `${documentLabels.length}개 삭제` : '문서 삭제'} <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  )
}
