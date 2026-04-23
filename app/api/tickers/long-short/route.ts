import { NextRequest } from 'next/server'
import { getLongShortTickers, type LongShortMode } from '@/lib/ticker-scoring'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const modeParam = params.get('mode') ?? params.get('tab') ?? 'long'
  const mode = (modeParam === 'short' ? 'short' : 'long') as LongShortMode
  const limitParam = Number(params.get('limit') ?? '100')
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(200, Math.floor(limitParam)) : 100

  try {
    const rows = await getLongShortTickers(mode, limit)
    return Response.json({
      mode,
      tickers: rows,
      total: rows.length,
      limit,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
