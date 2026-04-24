import { config } from 'dotenv'
config({ path: '.env.local' })

/**
 * Day 7 driver — classify a source-filtered sample of pending events.
 *
 * Usage:
 *   npx tsx scripts/_archive/_classify-backfill-sample.ts --source=sec --limit=100
 *   npx tsx scripts/_archive/_classify-backfill-sample.ts --source=fmp --limit=100
 *
 * Calls the library-level generateTheme(event) per event with concurrency=3.
 * Does NOT change library code. Does NOT touch the .env.localc typo.
 */

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
  let limit = 100
  for (const a of args) {
    const m = a.match(/^--([a-z_-]+)=(.+)$/)
    if (!m) continue
    if (m[1] === 'source') {
      if (m[2] === 'sec' || m[2] === 'fmp') source = m[2]
      else { console.error(`invalid --source: ${m[2]}`); process.exit(1) }
    } else if (m[1] === 'limit') {
      limit = parseInt(m[2], 10)
      if (!Number.isFinite(limit) || limit < 1) { console.error(`invalid --limit`); process.exit(1) }
    }
  }
  return { source, limit }
}

async function main() {
  const { source, limit } = parseArgs()
  const startAll = Date.now()

  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { generateTheme } = await import('../../lib/theme-generator')
  const pLimit = (await import('p-limit')).default

  const filterExpr =
    source === 'sec'
      ? { key: 'source_name', op: 'eq', val: 'SEC EDGAR 8-K Filings' }
      : { key: 'source_name', op: 'ilike', val: 'FMP Backfill%' }

  // Fetch pending events matching the source filter, newest first.
  // classifier_reasoning IS NULL mirrors the library's own filter.
  let q = supabaseAdmin
    .from('events')
    .select('id, headline, raw_content, source_name, source_url, event_date, mentioned_tickers')
    .is('trigger_theme_id', null)
    .is('classifier_reasoning', null)
    .order('event_date', { ascending: false })
    .limit(limit)
  q = filterExpr.op === 'eq' ? q.eq(filterExpr.key, filterExpr.val) : q.ilike(filterExpr.key, filterExpr.val)
  const { data: events, error } = await q
  if (error) { console.error(error); process.exit(1) }
  if (!events || events.length === 0) { console.log('no pending events'); return }

  console.log(`source=${source} · fetched ${events.length} pending events\n`)

  // Snapshot theme state for delta reporting
  const { data: themesBefore } = await supabaseAdmin
    .from('themes')
    .select('id, first_event_at')
  const themeFirstBefore = new Map<string, string | null>()
  for (const t of themesBefore ?? []) themeFirstBefore.set(t.id as string, (t.first_event_at as string | null) ?? null)

  const counts: Record<string, number> = {}
  const samples: Array<{ event_id: string; headline: string; action: string; theme_id?: string; archetype_id?: string; reasoning: string }> = []
  const limiter = pLimit(3)
  let done = 0

  const results = await Promise.allSettled(
    (events as EventRow[]).map((ev) =>
      limiter(async () => {
        const res = await generateTheme(ev)
        done++
        if (done % 20 === 0) console.log(`  progress ${done}/${events.length}`)
        return { ev, res }
      })
    )
  )

  let errors = 0
  for (const r of results) {
    if (r.status === 'rejected') {
      errors++
      console.error(`  REJECTED: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      continue
    }
    const { ev, res } = r.value
    counts[res.action] = (counts[res.action] ?? 0) + 1
    samples.push({
      event_id: ev.id,
      headline: ev.headline,
      action: res.action,
      theme_id: (res as { theme_id?: string }).theme_id,
      archetype_id: (res as { archetype_id?: string }).archetype_id,
      reasoning: res.reasoning ?? '',
    })
  }

  // Theme delta
  const { data: themesAfter } = await supabaseAdmin
    .from('themes')
    .select('id, first_event_at, name, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  let themesCreated = 0
  let firstEventPushed = 0
  for (const t of themesAfter ?? []) {
    if (!themeFirstBefore.has(t.id as string)) themesCreated++
    else {
      const before = themeFirstBefore.get(t.id as string)
      const after = (t.first_event_at as string | null) ?? null
      if (before && after && after < before) firstEventPushed++
    }
  }

  const elapsed = ((Date.now() - startAll) / 1000).toFixed(0)

  console.log(`\n=== Distribution ===`)
  for (const [a, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${a.padEnd(24)} ${String(n).padStart(4)} (${((n / events.length) * 100).toFixed(1)}%)`)
  }
  if (errors > 0) console.log(`  errors (rejected)        ${errors}`)

  console.log(`\n=== Theme delta ===`)
  console.log(`  themes_created (among 50 newest): ${themesCreated}`)
  console.log(`  first_event_at pushed earlier:    ${firstEventPushed}`)

  console.log(`\n=== Random 10 samples ===`)
  const shuffled = [...samples].sort(() => Math.random() - 0.5).slice(0, 10)
  for (const s of shuffled) {
    console.log(`  [${s.action}] ${s.headline.slice(0, 85)}`)
    if (s.theme_id) console.log(`     theme=${s.theme_id}${s.archetype_id ? ` · arc=${s.archetype_id}` : ''}`)
    console.log(`     reason: ${s.reasoning.slice(0, 110)}`)
  }

  console.log(`\nElapsed: ${elapsed}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
