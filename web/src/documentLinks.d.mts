export type NavigationClick = Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function documentUrl(documentId: string, chunkIndex?: number | null): string
export function isPlainLeftClick(event: NavigationClick): boolean
