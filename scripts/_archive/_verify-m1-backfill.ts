import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync } from 'fs'

async function fetchAll<T>(
  client: { from: (t: string) => { select: (c: string) => Promise<{ data: T[] | null; error: unknown }> } },
  table: string,
  cols: string,
  pageSize = 1000,
): Promise<T[]> {
  const supabase = client as unknown as {
    from: (t: string) => {
      select: (c: string, o?: { count?: 'exact' | 'estimated' }) => {
        range: (a: number, b: number) => Promise<{ data: T[] | null; error: unknown; count: number | null }>
      }
    }
  }
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const snapshot = JSON.parse(readFileSync('data/pre-backfill-snapshot.json', 'utf8'))

  console.log('=== Post-M1 Backfill Verify ===\n')
  console.log(`Snapshot taken: ${snapshot.snapshot_at}`)
  console.log(`Backfill ran:   ~2026-04-24T01:24:58Z (M1: 2026-01-23 → 02-22)\n`)

  // ---------------------------------------------------------------------------
  // 1. Events total + delta
  // ---------------------------------------------------------------------------
  type EventRow = {
    id: string
    source_name: string | null
    source_url: string | null
    event_date: string | null
    trigger_theme_id: string | null
    raw_content: string | null
    created_at: string
  }
  const events = await fetchAll<EventRow>(
    supabaseAdmin as never,
    'events',
    'id, source_name, source_url, event_date, trigger_theme_id, raw_content, created_at',
  )
  const preTotal = snapshot.totals.events as number
  const delta = events.length - preTotal
  console.log(`1. Event totals`)
  console.log(`   pre-backfill:  ${preTotal}`)
  console.log(`   now:           ${events.length}`)
  console.log(`   delta:         +${delta}  (expected ≈ +673)\n`)

  // ---------------------------------------------------------------------------
  // 2. Source distribution + dedup
  // ---------------------------------------------------------------------------
  console.log(`2. SEC 8-K source breakdown`)
  const sec8k = events.filter((e) => (e.source_name ?? '').includes('SEC EDGAR 8-K Filings'))
  // Partition by created_at relative to backfill window
  const backfillCutoff = new Date('2026-04-24T00:00:00Z').getTime()
  const recentSec = sec8k.filter((e) => new Date(e.created_at).getTime() >= backfillCutoff)
  const originalSec = sec8k.filter((e) => new Date(e.created_at).getTime() < backfillCutoff)
  console.log(`   total SEC 8-K:         ${sec8k.length}`)
  console.log(`   pre-backfill (old):    ${originalSec.length}`)
  console.log(`   new (today):           ${recentSec.length}`)

  // accession_number dedup check inside new batch
  const accs: Record<string, string[]> = {}
  for (const e of recentSec) {
    try {
      const rc = JSON.parse(e.raw_content ?? '{}')
      const a = rc.accession_number
      if (a) (accs[a] ??= []).push(e.id)
    } catch {}
  }
  const dupes = Object.entries(accs).filter(([, ids]) => ids.length > 1)
  console.log(`   unique accessions:     ${Object.keys(accs).length}`)
  console.log(`   duplicate accessions:  ${dupes.length}`)

  // source_url overlap between old and new SEC batches
  const oldUrls = new Set(originalSec.map((e) => e.source_url).filter(Boolean))
  const newUrlOverlap = recentSec.filter((e) => e.source_url && oldUrls.has(e.source_url)).length
  console.log(`   source_url overlap w/ old SEC: ${newUrlOverlap}\n`)

  // ---------------------------------------------------------------------------
  // 3. theme.days_since_first_event distribution
  // ---------------------------------------------------------------------------
  type Theme = { id: string; current_cycle_stage: string | null }
  const themes = await fetchAll<Theme>(supabaseAdmin as never, 'themes', 'id, current_cycle_stage')
  const activeThemes = themes // snapshot captured all (43 active had stage)

  // Recompute first event per theme from CURRENT events
  const firstByTheme = new Map<string, number>()
  for (const e of events) {
    if (!e.trigger_theme_id || !e.event_date) continue
    const t = new Date(e.event_date).getTime()
    if (!Number.isFinite(t)) continue
    const cur = firstByTheme.get(e.trigger_theme_id)
    if (cur === undefined || t < cur) firstByTheme.set(e.trigger_theme_id, t)
  }

  const now = Date.now()
  const daysArr: number[] = []
  for (const th of themes) {
    const f = firstByTheme.get(th.id)
    if (f !== undefined) daysArr.push(Math.floor((now - f) / 86400000))
  }
  daysArr.sort((a, b) => a - b)
  const q = (p: number) => daysArr[Math.min(daysArr.length - 1, Math.floor(p * daysArr.length))]
  // Compute pre-stats from snapshot.themes array
  const preDays = (snapshot.themes as Array<{ days_since_first_event: number | null }>)
    .map((t) => t.days_since_first_event)
    .filter((d): d is number => d !== null && Number.isFinite(d))
    .sort((a, b) => a - b)
  const qp = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]
  console.log(`3. days_since_first_event (themes)`)
  if (preDays.length > 0) {
    console.log(`   pre:  min=${preDays[0]} p25=${qp(preDays, 0.25)} p50=${qp(preDays, 0.5)} p75=${qp(preDays, 0.75)} max=${preDays[preDays.length - 1]}  (n=${preDays.length})`)
  }
  if (daysArr.length === 0) {
    console.log(`   now:  (no themes with linked events — expected, since backfill events have trigger_theme_id=null)\n`)
  } else {
    console.log(`   now:  min=${daysArr[0]} p25=${q(0.25)} p50=${q(0.5)} p75=${q(0.75)} max=${daysArr[daysArr.length - 1]}  (n=${daysArr.length})`)
    console.log(`   Note: distribution will NOT shift until Day 7 classifier links backfill events to themes\n`)
  }

  // ---------------------------------------------------------------------------
  // 4. current_cycle_stage distribution
  // ---------------------------------------------------------------------------
  const stageDist: Record<string, number> = {}
  for (const t of themes) {
    const k = t.current_cycle_stage ?? 'null'
    stageDist[k] = (stageDist[k] ?? 0) + 1
  }
  const preStages = snapshot.stage_distribution as Record<string, number>
  console.log(`4. current_cycle_stage (themes)`)
  const keys = new Set([...Object.keys(preStages), ...Object.keys(stageDist)])
  for (const k of keys) {
    const preN = preStages[k] ?? 0
    const nowN = stageDist[k] ?? 0
    const d = nowN - preN
    const dStr = d === 0 ? '' : ` (${d > 0 ? '+' : ''}${d})`
    console.log(`   ${k.padEnd(8)} pre=${String(preN).padStart(3)} now=${String(nowN).padStart(3)}${dStr}`)
  }
  console.log(`   Note: stage distribution should NOT change until compute-cycle-stage re-runs\n`)

  // ---------------------------------------------------------------------------
  // 5. Auto-classification rate of backfill events
  // ---------------------------------------------------------------------------
  const newLinked = recentSec.filter((e) => e.trigger_theme_id !== null).length
  console.log(`5. Backfill event auto-classification`)
  console.log(`   new SEC events:        ${recentSec.length}`)
  console.log(`   linked to a theme:     ${newLinked}`)
  console.log(`   unclassified:          ${recentSec.length - newLinked}  (expected == ${recentSec.length}, classifier in Day 7)\n`)

  // ---------------------------------------------------------------------------
  // 6. event_date sanity check
  // ---------------------------------------------------------------------------
  const dates = recentSec
    .map((e) => e.event_date)
    .filter((d): d is string => Boolean(d))
    .sort()
  console.log(`6. event_date sanity (new batch)`)
  console.log(`   min:   ${dates[0]}`)
  console.log(`   max:   ${dates[dates.length - 1]}`)
  console.log(`   expected window: 2026-01-23T12:00:00Z → 2026-02-22T12:00:00Z`)
  const inRange = dates.filter((d) => d >= '2026-01-23' && d <= '2026-02-23').length
  console.log(`   rows in window: ${inRange} / ${dates.length}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
