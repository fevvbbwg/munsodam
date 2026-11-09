export function isImeCompositionEvent(event) {
  return Boolean(event?.isComposing) || event?.keyCode === 229
}

export function shouldClearSearchOnEscape(event, hasQuery) {
  return event?.key === 'Escape' && Boolean(hasQuery) && !isImeCompositionEvent(event)
}
