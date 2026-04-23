import { NextRequest } from 'next/server'
import { computeConvictionForActiveThemes } from '@/lib/conviction-score'

// ~50 themes × ~10s each, leave headroom for retries
export const maxDuration = 800

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const result = await computeConvictionForActiveThemes()
  const elapsedMs = Date.now() - started

  return Response.json({
    ok: true,
    elapsed_ms: elapsedMs,
    scored_count: result.ok.length,
    failed_count: result.failed.length,
    total_cost_usd: result.total_cost_usd,
    scored: result.ok,
    failed: result.failed,
  })
}
