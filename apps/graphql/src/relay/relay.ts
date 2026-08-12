// src/relay/relay.ts
function b64encode(s: string): string {
  const g: any = globalThis as any
  if (typeof g?.btoa === 'function') return g.btoa(s)
  return Buffer.from(s, 'utf8').toString('base64')
}

function b64decode(s: string): string {
  const g: any = globalThis as any
  if (typeof g?.atob === 'function') return g.atob(s)
  return Buffer.from(s, 'base64').toString('utf8')
}

export function encodeCursor(index: number): string {
  return b64encode(`cursor:${index}`)
}

export function decodeCursor(cursor?: string | null): number | null {
  if (!cursor) return null
  try {
    const raw = b64decode(cursor)
    if (!raw.startsWith('cursor:')) return null
    const n = parseInt(raw.slice('cursor:'.length), 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function paginateWindow(args: {
  totalCount: number
  first?: number | null
  after?: string | null
  last?: number | null
  before?: string | null
}): {
  start: number
  end: number
  hasPreviousPage: boolean
  hasNextPage: boolean
} {
  const total = Math.max(0, args.totalCount)

  const afterIdxRaw = decodeCursor(args.after)
  const beforeIdxRaw = decodeCursor(args.before)

  const windowStart = Math.min(total, Math.max(0, (afterIdxRaw ?? -1) + 1))
  const windowEnd = Math.min(total, Math.max(windowStart, beforeIdxRaw ?? total))

  let start = windowStart
  let end = windowEnd

  const first = args.first == null ? null : Math.max(0, args.first)
  const last = args.last == null ? null : Math.max(0, args.last)

  if (first != null) {
    end = Math.min(windowEnd, start + first)
  } else if (last != null) {
    start = Math.max(windowStart, windowEnd - last)
    end = windowEnd
  }

  const hasPreviousPage = start > windowStart
  const hasNextPage = end < windowEnd

  return {start, end, hasPreviousPage, hasNextPage}
}
