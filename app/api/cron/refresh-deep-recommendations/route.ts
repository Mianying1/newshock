import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { processTheme } from '@/lib/deep-recommendations'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const BATCH_SIZE = 5
const CONCURRENCY = 3
const STALE_DAYS = 7

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function spawn() {
    while (true) {
      const idx = next++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx])
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => spawn()))
  return results
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const started = Date.now()
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString()

  try {
    const { data: themes, error } = await supabaseAdmin
      .from('themes')
      .select('id, name, event_count, deep_generated_at')
      .eq('status', 'active')
      .or(`deep_generated_at.is.null,deep_generated_at.lt.${staleCutoff}`)
      .order('deep_generated_at', { ascending: true, nullsFirst: true })
      .order('event_count', { ascending: false })
      .limit(BATCH_SIZE)

    if (error) {
      return Response.json({ success: false, error: `fetch themes: ${error.message}` }, { status: 500 })
    }

    const queue = themes ?? []
    if (queue.length === 0) {
      return Response.json({
        success: true,
        message: 'All active themes up-to-date',
        processed: 0,
        elapsed_sec: Math.round((Date.now() - started) / 1000),
      })
    }

    const results = await runPool(queue, CONCURRENCY, (t) => processTheme(t.id))

    const successCount = results.filter((r) => r.ok).length
    const failCount = results.length - successCount
    const totalRecs = results.reduce((s, r) => s + r.recommendations_inserted, 0)
    const totalHidden = results.reduce((s, r) => s + r.often_missed, 0)
    const totalCost = results.reduce((s, r) => s + (r.stats?.cost_usd ?? 0), 0)

    const { count: remaining } = await supabaseAdmin
      .from('themes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .or(`deep_generated_at.is.null,deep_generated_at.lt.${staleCutoff}`)

    return Response.json({
      success: true,
      processed: results.length,
      success_count: successCount,
      fail_count: failCount,
      recs_written: totalRecs,
      hidden_angles: totalHidden,
      cost_usd: Number(totalCost.toFixed(4)),
      elapsed_sec: Math.round((Date.now() - started) / 1000),
      remaining_stale: remaining ?? 0,
      failures: results
        .filter((r) => !r.ok)
        .map((r) => ({ theme: r.theme_name, error: r.error })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
