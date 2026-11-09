import type { Doc } from './types'

export function savedSourceAvailability(
  documents: Doc[],
  documentsLoaded: boolean,
  documentsError: string,
  documentId: string,
): boolean | null
