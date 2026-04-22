import { NextRequest } from 'next/server'
import { computeTickerScores, type TickerScores } from '@/lib/ticker-scoring'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type SortKey = 'thematic' | 'potential'

const SORT_FIELDS: Record<SortKey, keyof TickerScores> = {
  thematic: 'thematic_score',
  potential: 'potential_score',
}

export async function GET(request: NextRequest) {
  const sortParam = (request.nextUrl.searchParams.get('sort') ?? 'thematic') as SortKey
  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '50')

  const sort: SortKey = SORT_FIELDS[sortParam] ? sortParam : 'thematic'
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(200, Math.floor(limitParam))
    : 50

  const field = SORT_FIELDS[sort]
  const all = await computeTickerScores()

  const filtered = sort === 'potential'
    ? all.filter((t) => t.potential_score > 0)
    : all.filter((t) => t.thematic_score > 0)

  const sorted = [...filtered].sort((a, b) => {
    const av = a[field] as number
    const bv = b[field] as number
    if (bv !== av) return bv - av
    return b.thematic_score - a.thematic_score
  })

  return Response.json({
    tickers: sorted.slice(0, limit),
    total: sorted.length,
    sort,
    limit,
    updated_at: new Date().toISOString(),
  })
}
