import { NextRequest } from 'next/server'
import { runComputeMultiScores } from '@/lib/run-compute-multi-scores'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const mode = request.nextUrl.searchParams.get('mode') === 'full' ? 'full' : 'incremental'

  const started = Date.now()
  const stats = await runComputeMultiScores(mode)
  const elapsedMs = Date.now() - started

  return Response.json({ ok: true, elapsed_ms: elapsedMs, stats })
}
