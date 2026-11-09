type ActivityCountRecord = {
  mode: 'vector' | 'keyword' | 'hybrid'
  view: 'results' | 'answer'
  query: string
  scopeLabel: string
}

export function countActivityViews(
  items: ActivityCountRecord[],
  query: string,
  modeFilter: 'all' | ActivityCountRecord['mode'],
): { all: number; results: number; answer: number }
