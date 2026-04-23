import { NextRequest } from 'next/server'
import { classifyAllUnclassified } from '@/lib/counter-evidence'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const result = await classifyAllUnclassified(100)
  const elapsedMs = Date.now() - started

  return Response.json({
    ok: true,
    elapsed_ms: elapsedMs,
    success: result.success,
    failed: result.failed,
    total_cost_usd: result.total_cost_usd,
    distribution: result.distribution,
    themes_refreshed: result.themes_refreshed,
    errors: result.errors,
  })
}
