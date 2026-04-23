import { NextRequest } from 'next/server'
import { runComputeSentimentScore } from '@/scripts/compute-sentiment-score'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const stats = await runComputeSentimentScore()
  const elapsedMs = Date.now() - started

  return Response.json({ ok: true, elapsed_ms: elapsedMs, stats })
}
