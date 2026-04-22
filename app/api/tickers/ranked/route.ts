import { NextRequest } from 'next/server'
import { computeTickerScores, type TickerScores } from '@/lib/ticker-scoring'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type SortKey = 'thematic' | 'momentum' | 'potential' | 'composite'

const SORT_FIELDS: Record<SortKey, keyof TickerScores> = {
  thematic: 'thematic_score',
  momentum: 'momentum_score',
  potential: 'potential_score',
  composite: 'composite_score',
}

export async function GET(request: NextRequest) {
  const sortParam = (request.nextUrl.searchParams.get('sort') ?? 'composite') as SortKey
  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '50')

  const sort = SORT_FIELDS[sortParam] ? sortParam : 'composite'
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(200, Math.floor(limitParam))
    : 50

  const field = SORT_FIELDS[sort]
  const all = await computeTickerScores()

  const sorted = [...all].sort((a, b) => {
    const av = a[field] as number
    const bv = b[field] as number
    if (bv !== av) return bv - av
    return b.composite_score - a.composite_score
  })

  return Response.json({
    tickers: sorted.slice(0, limit),
    total: sorted.length,
    sort,
    limit,
    updated_at: new Date().toISOString(),
  })
}
