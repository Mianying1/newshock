import { NextRequest } from 'next/server'
import {
  computeTickerScores,
  getThematicTickers,
  getPotentialTickers,
  type ThematicWindow,
  type PotentialStage,
} from '@/lib/ticker-scoring'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type SortKey = 'thematic' | 'potential'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const sortParam = params.get('sort') ?? 'thematic'
  const sort: SortKey = sortParam === 'potential' ? 'potential' : 'thematic'
  const limitParam = Number(params.get('limit') ?? '50')
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(200, Math.floor(limitParam))
    : 50

  const windowParam = params.get('window')
  const stageParam = params.get('stage')
  const hasWindow = windowParam === '7d' || windowParam === '30d'
  const hasStage = stageParam === 'early' || stageParam === 'mid' || stageParam === 'all'

  // Back-compat: no window/stage → legacy composite scores (used by /tickers)
  if (!hasWindow && !hasStage) {
    const all = await computeTickerScores()
    const filtered = sort === 'potential'
      ? all.filter((t) => t.potential_score > 0)
      : all.filter((t) => t.thematic_score > 0)
    const sorted = [...filtered].sort((a, b) => {
      const av = sort === 'potential' ? a.potential_score : a.thematic_score
      const bv = sort === 'potential' ? b.potential_score : b.thematic_score
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

  if (sort === 'thematic') {
    const win: ThematicWindow = windowParam === '30d' ? '30d' : '7d'
    const rows = await getThematicTickers(win, 200)
    return Response.json({
      tickers: rows.slice(0, limit),
      total: rows.length,
      sort,
      window: win,
      limit,
      updated_at: new Date().toISOString(),
    })
  }

  const stage: PotentialStage =
    stageParam === 'early' ? 'early' : stageParam === 'mid' ? 'mid' : 'all'
  const rows = await getPotentialTickers(stage, 200)
  return Response.json({
    tickers: rows.slice(0, limit),
    total: rows.length,
    sort,
    stage,
    limit,
    updated_at: new Date().toISOString(),
  })
}
