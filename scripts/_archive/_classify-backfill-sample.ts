import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'

/**
 * Day 7 driver — classify source-filtered pending events through the library
 * theme-generator pipeline, with retry + concurrency tuning.
 *
 * Usage:
 *   npx tsx scripts/_archive/_classify-backfill-sample.ts --source=sec --limit=100
 *   npx tsx scripts/_archive/_classify-backfill-sample.ts --source=sec --limit=all --rate-limit=2
 *   npx tsx scripts/_archive/_classify-backfill-sample.ts --source=fmp --limit=100
 *
 * Behaviour:
 * - Fetches events with source_name filter + trigger_theme_id IS NULL +
 *   classifier_reasoning IS NULL (matches library's own pending filter).
 * - Calls lib generateTheme(event) at concurrency = rate_limit (default 3).
 * - Retries events whose result.action === 'error' (transient 429 / 5xx / network)
 *   up to 3 times with exponential backoff 5s / 10s / 20s.
 * - Dumps permanently-failed event ids to errored_events.json.
 * - Does NOT modify library code.
 */

const RETRIABLE_PATTERNS = [
  /429/,
  /rate[_\s]?limit/i,
  /5\d\d\b/,
  /overloaded/i,
  /socket hang up/i,
  /timeout/i,
  /ECONN/,
  /fetch failed/i,
]

interface EventRow {
  id: string
  headline: string
  raw_content: string | null
  source_name: string | null
  source_url: string | null
  event_date: string | null
  mentioned_tickers: string[] | null
}

function parseArgs() {
  const args = process.argv.slice(2)
  let source: 'sec' | 'fmp' = 'sec'
  let limit: number | 'all' = 100
  let rateLimit = 3
  for (const a of args) {
    const m = a.match(/^--([a-z_-]+)=(.+)$/)
    if (!m) continue
    if (m[1] === 'source') {
      if (m[2] === 'sec' || m[2] === 'fmp') source = m[2]
      else { console.error(`invalid --source: ${m[2]}`); process.exit(1) }
    } else if (m[1] === 'limit') {
      if (m[2] === 'all') limit = 'all'
      else {
        const n = parseInt(m[2], 10)
        if (!Number.isFinite(n) || n < 1) { console.error(`invalid --limit`); process.exit(1) }
        limit = n
      }
    } else if (m[1] === 'rate-limit' || m[1] === 'rate_limit') {
      rateLimit = parseInt(m[2], 10)
      if (!Number.isFinite(rateLimit) || rateLimit < 1) { console.error(`invalid --rate-limit`); process.exit(1) }
    }
  }
  return { source, limit, rateLimit }
}

function isRetriable(msg: string): boolean {
  return RETRIABLE_PATTERNS.some((re) => re.test(msg))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const { source, limit, rateLimit } = parseArgs()
  const startAll = Date.now()

  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { generateTheme } = await import('../../lib/theme-generator')
  const pLimit = (await import('p-limit')).default

  const filterExpr =
    source === 'sec'
      ? { key: 'source_name', op: 'eq', val: 'SEC EDGAR 8-K Filings' }
      : { key: 'source_name', op: 'ilike', val: 'FMP Backfill%' }

  // Paginate to sidestep Supabase's 1000-row cap when --limit=all
  const pageSize = 1000
  const events: EventRow[] = []
  const target = limit === 'all' ? Infinity : limit
  for (let from = 0; events.length < target; from += pageSize) {
    const want = Math.min(pageSize, target - events.length)
    let q = supabaseAdmin
      .from('events')
      .select('id, headline, raw_content, source_name, source_url, event_date, mentioned_tickers')
      .is('trigger_theme_id', null)
      .is('classifier_reasoning', null)
      .order('event_date', { ascending: false })
      .range(from, from + want - 1)
    q = filterExpr.op === 'eq' ? q.eq(filterExpr.key, filterExpr.val) : q.ilike(filterExpr.key, filterExpr.val)
    const { data: page, error } = await q
    if (error) { console.error(error); process.exit(1) }
    if (!page || page.length === 0) break
    events.push(...(page as EventRow[]))
    if (page.length < want) break
  }
  if (events.length === 0) { console.log('no pending events'); return }

  console.log(`source=${source} · limit=${limit} · rate_limit=${rateLimit}`)
  console.log(`fetched ${events.length} pending events\n`)

  // Snapshot theme state for delta reporting
  const themesBefore: Array<{ id: string; first_event_at: string | null }> = []
  for (let from = 0; ; from += pageSize) {
    const { data: page } = await supabaseAdmin
      .from('themes')
      .select('id, first_event_at')
      .range(from, from + pageSize - 1)
    if (!page || page.length === 0) break
    themesBefore.push(...(page as Array<{ id: string; first_event_at: string | null }>))
    if (page.length < pageSize) break
  }
  const themeFirstBefore = new Map<string, string | null>()
  for (const t of themesBefore) themeFirstBefore.set(t.id, t.first_event_at ?? null)

  const counts: Record<string, number> = {}
  const samples: Array<{ event_id: string; headline: string; action: string; theme_id?: string; archetype_id?: string; reasoning: string; attempts: number }> = []
  const permanentlyFailed: Array<{ event_id: string; headline: string; last_error: string; attempts: number }> = []
  let retrySuccess = 0
  let totalAttempts = 0

  const limiter = pLimit(rateLimit)
  let done = 0

  // Per-event retry: up to 3 attempts with 5s / 10s / 20s backoff
  async function classifyWithRetry(ev: EventRow) {
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      totalAttempts++
      const res = await generateTheme(ev)
      if (res.action !== 'error') {
        if (attempt > 1) retrySuccess++
        return { ev, res, attempts: attempt, lastError }
      }
      lastError = res.reasoning ?? 'unknown error'
      if (!isRetriable(lastError) || attempt === 3) {
        return { ev, res, attempts: attempt, lastError }
      }
      const backoff = attempt === 1 ? 5000 : attempt === 2 ? 10000 : 20000
      console.log(`  [retry ${attempt}→${attempt + 1}] ${ev.id.slice(0, 8)} after ${backoff / 1000}s · ${lastError.slice(0, 80)}`)
      await sleep(backoff)
    }
    // Unreachable
    throw new Error('retry loop fallthrough')
  }

  const results = await Promise.allSettled(
    events.map((ev) =>
      limiter(async () => {
        const r = await classifyWithRetry(ev)
        done++
        if (done % 25 === 0 || done === events.length) {
          const pct = ((done / events.length) * 100).toFixed(1)
          const elapsed = ((Date.now() - startAll) / 1000).toFixed(0)
          console.log(`  progress ${done}/${events.length} (${pct}%) · ${elapsed}s elapsed`)
        }
        return r
      })
    )
  )

  let rejected = 0
  for (const r of results) {
    if (r.status === 'rejected') {
      rejected++
      console.error(`  REJECTED: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      continue
    }
    const { ev, res, attempts, lastError } = r.value
    counts[res.action] = (counts[res.action] ?? 0) + 1
    samples.push({
      event_id: ev.id,
      headline: ev.headline,
      action: res.action,
      theme_id: (res as { theme_id?: string }).theme_id,
      archetype_id: (res as { archetype_id?: string }).archetype_id,
      reasoning: res.reasoning ?? '',
      attempts,
    })
    if (res.action === 'error') {
      permanentlyFailed.push({ event_id: ev.id, headline: ev.headline, last_error: lastError, attempts })
    }
  }

  // Theme delta
  const themesAfter: Array<{ id: string; first_event_at: string | null; name: string; created_at: string }> = []
  for (let from = 0; ; from += pageSize) {
    const { data: page } = await supabaseAdmin
      .from('themes')
      .select('id, first_event_at, name, created_at')
      .range(from, from + pageSize - 1)
    if (!page || page.length === 0) break
    themesAfter.push(...(page as typeof themesAfter))
    if (page.length < pageSize) break
  }
  let themesCreated = 0
  let firstEventPushed = 0
  for (const t of themesAfter) {
    if (!themeFirstBefore.has(t.id)) themesCreated++
    else {
      const before = themeFirstBefore.get(t.id)
      const after = t.first_event_at ?? null
      if (before && after && after < before) firstEventPushed++
    }
  }

  // Dump failures
  if (permanentlyFailed.length > 0) {
    const path = `errored_events_${source}_${Date.now()}.json`
    writeFileSync(path, JSON.stringify(permanentlyFailed, null, 2))
    console.log(`\nwrote ${permanentlyFailed.length} permanent failures to ${path}`)
  }

  const elapsed = ((Date.now() - startAll) / 1000).toFixed(0)

  console.log(`\n=== Distribution ===`)
  for (const [a, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${a.padEnd(24)} ${String(n).padStart(5)} (${((n / events.length) * 100).toFixed(1)}%)`)
  }
  if (rejected > 0) console.log(`  rejected (promise)       ${rejected}`)

  const success = events.length - permanentlyFailed.length - rejected
  console.log(`\n=== Retry summary ===`)
  console.log(`  events processed:     ${events.length}`)
  console.log(`  total attempts:       ${totalAttempts}`)
  console.log(`  success (first try):  ${success - retrySuccess}`)
  console.log(`  success (after retry):${retrySuccess}`)
  console.log(`  permanent failures:   ${permanentlyFailed.length}`)
  console.log(`  promise rejected:     ${rejected}`)

  console.log(`\n=== Theme delta ===`)
  console.log(`  themes_created (full table): ${themesCreated}`)
  console.log(`  first_event_at pushed earlier: ${firstEventPushed}`)

  console.log(`\n=== Random 10 samples ===`)
  const shuffled = [...samples].filter((s) => s.action !== 'error').sort(() => Math.random() - 0.5).slice(0, 10)
  for (const s of shuffled) {
    console.log(`  [${s.action}] ${s.headline.slice(0, 85)}${s.attempts > 1 ? ` (retries=${s.attempts})` : ''}`)
    if (s.theme_id) console.log(`     theme=${s.theme_id}${s.archetype_id ? ` · arc=${s.archetype_id}` : ''}`)
    console.log(`     reason: ${s.reasoning.slice(0, 110)}`)
  }

  console.log(`\nElapsed: ${elapsed}s (${(Number(elapsed) / 60).toFixed(1)} min)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
