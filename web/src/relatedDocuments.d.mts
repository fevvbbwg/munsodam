import type { Doc } from './types'

export function selectRelatedDocuments(
  documents: Doc[],
  recentDocumentIds: string[],
  selectedDocumentId: string | null,
  limit?: number,
): Doc[]

export function selectRecentHomeDocuments(
  documents: Doc[],
  recentDocumentIds: string[],
  favoriteDocumentIds: string[],
  limit?: number,
): Doc[]

export function selectWorkspaceRecentDocuments(
  documents: Doc[],
  selectedDocumentId: string | null,
  recentDocumentIds: string[],
  favoriteDocumentIds: string[],
  limit?: number,
): Doc[]
