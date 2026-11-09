export function isImeCompositionEvent(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean

export function shouldClearSearchOnEscape(
  event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>,
  hasQuery: boolean,
): boolean
