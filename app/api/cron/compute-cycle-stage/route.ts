import { NextRequest } from 'next/server'
import { runComputeCycleStage } from '@/scripts/compute-cycle-stage'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const stats = await runComputeCycleStage()
  const elapsedMs = Date.now() - started

  return Response.json({ ok: true, elapsed_ms: elapsedMs, stats })
}
