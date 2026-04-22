/* eslint-disable no-console */
/**
 * Rollout · Deep Ticker Recommendations
 *
 *   tsx --env-file=.env.local scripts/rollout-deep-recommendations.ts --limit 3
 *   tsx --env-file=.env.local scripts/rollout-deep-recommendations.ts            # full
 *
 * Concurrency = 3 (Anthropic rate-limit friendly). Retries inside processTheme (2x).
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import { processTheme, type ThemeProcessResult } from '@/lib/deep-recommendations'

function parseArgs(): { limit: number | null; only: string[] | null } {
  const args = process.argv.slice(2)
  let limit: number | null = null
  let only: string[] | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--limit') {
      limit = parseInt(args[++i] ?? '0', 10)
      if (!Number.isFinite(limit) || limit! <= 0) limit = null
    } else if (a === '--only') {
      only = (args[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return { limit, only }
}

async function fetchThemes(limit: number | null, only: string[] | null) {
  let q = supabaseAdmin
    .from('themes')
    .select('id, name, event_count, status')
    .eq('status', 'active')
    .order('event_count', { ascending: false })
  if (only && only.length > 0) q = q.in('id', only)
  if (limit) q = q.limit(limit)
  const { data, error } = await q
  if (error) throw new Error(`fetch themes: ${error.message}`)
  return (data ?? []) as { id: string; name: string; event_count: number }[]
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function spawn() {
    while (true) {
      const idx = next++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx], idx)
      // gentle gap between calls so we don't fan out in the exact same 100ms
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => spawn()))
  return results
}

function fmtPct(n: number, d: number) {
  if (d === 0) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

async function main() {
  const { limit, only } = parseArgs()
  const mode = limit ? `LIMIT=${limit}` : only ? `ONLY=${only.length}` : 'FULL'
  console.log('=== Rollout · Deep Ticker Recommendations ===')
  console.log(`Mode: ${mode}`)

  const themes = await fetchThemes(limit, only)
  console.log(`Themes queued: ${themes.length}`)
  console.log('')

  if (themes.length === 0) {
    console.log('No themes to process. Exiting.')
    return
  }

  const started = Date.now()
  const results = await runPool<typeof themes[number], ThemeProcessResult>(
    themes,
    3,
    async (t, idx) => {
      const label = `[${idx + 1}/${themes.length}]`
      process.stderr.write(`${label} ▶ ${t.name} (${t.event_count} events)\n`)
      const r = await processTheme(t.id)
      if (r.ok) {
        process.stderr.write(
          `${label} ✓ ${t.name} · recs=${r.recommendations_inserted} · hidden=${r.often_missed} · +${r.added_tickers.length}/-${r.removed_tickers.length} · $${r.stats?.cost_usd.toFixed(4) ?? '?'} · ${r.stats?.elapsed_sec.toFixed(1) ?? '?'}s${r.error ? ` · warn: ${r.error}` : ''}\n`
        )
      } else {
        process.stderr.write(`${label} ✗ ${t.name} · ${r.error}\n`)
      }
      return r
    }
  )
  const wall = (Date.now() - started) / 1000

  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const totalCost = results.reduce((s, r) => s + (r.stats?.cost_usd ?? 0), 0)
  const totalRecs = ok.reduce((s, r) => s + r.recommendations_inserted, 0)
  const totalHidden = ok.reduce((s, r) => s + r.often_missed, 0)
  const totalAdded = ok.reduce((s, r) => s + r.added_tickers.length, 0)
  const totalRemoved = ok.reduce((s, r) => s + r.removed_tickers.length, 0)

  console.log('')
  console.log('=== SUMMARY ===')
  console.log(`Success:      ${ok.length}/${results.length} (${fmtPct(ok.length, results.length)})`)
  console.log(`Failed:       ${failed.length}`)
  console.log(`Recs written: ${totalRecs}`)
  console.log(`  of which hidden/often_missed: ${totalHidden}`)
  console.log(`Ticker churn: +${totalAdded} / -${totalRemoved}`)
  console.log(`Total cost:   $${totalCost.toFixed(4)}`)
  console.log(`Wall time:    ${wall.toFixed(1)}s`)
  if (failed.length > 0) {
    console.log('')
    console.log('--- FAILED ---')
    for (const f of failed) {
      console.log(`✗ ${f.theme_name} (${f.theme_id}): ${f.error}`)
    }
  }
  console.log('')
  console.log('--- PER-THEME DETAIL ---')
  for (const r of results) {
    if (!r.ok) continue
    const add = r.added_tickers.length > 0 ? ` +[${r.added_tickers.join(',')}]` : ''
    const rem = r.removed_tickers.length > 0 ? ` -[${r.removed_tickers.join(',')}]` : ''
    console.log(
      `  ${r.theme_name}: ${r.recommendations_inserted} recs · ${r.often_missed} hidden${add}${rem}`
    )
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
