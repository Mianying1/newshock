import { NextRequest } from 'next/server'
import { getApprovedNewAngles } from '@/lib/ticker-scoring'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '100')
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(200, Math.floor(limitParam)) : 100
  try {
    const rows = await getApprovedNewAngles(limit)
    return Response.json(
      {
        directions: rows,
        total: rows.length,
        limit,
        updated_at: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
