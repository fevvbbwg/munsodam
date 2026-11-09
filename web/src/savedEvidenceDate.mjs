export function formatSavedEvidenceDate(timestamp, now = new Date()) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '날짜 확인 필요'
  const options = date.getFullYear() === now.getFullYear()
    ? { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  return date.toLocaleString('ko-KR', options)
}
