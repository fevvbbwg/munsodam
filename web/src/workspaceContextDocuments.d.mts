export function selectWorkspaceContextDocuments<T extends { id: string }>(
  selectedDocument: T | null,
  recentDocuments: T[],
  favoriteDocuments: T[],
  limit?: number,
): T[]
