import type { Doc } from './types'

export function createDocumentDisplayNames(documents: Doc[]): Map<string, string>

export function documentDisplayName(document: Doc, documents: Doc[]): string

export function displayDocumentName(documents: Doc[], documentId: string, fallback: string): string
