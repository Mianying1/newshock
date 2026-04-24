import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // load all archetypes with typical_tickers, duration, and playbook snapshot
  const { data: archs } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, name_zh, typical_tickers, typical_duration_days_min, typical_duration_days_max, playbook, deprecated, is_active')
  if (!archs) return

  // load active/cooling themes by archetype_id
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, archetype_id, status, current_cycle_stage')
  const activeArchIds = new Set<string>()
  const archThemeStatus = new Map<string, string[]>()
  for (const t of themes ?? []) {
    if (t.archetype_id && (t.status === 'active' || t.status === 'cooling')) {
      activeArchIds.add(t.archetype_id)
    }
    if (t.archetype_id) {
      const cur = archThemeStatus.get(t.archetype_id) ?? []
      cur.push(t.status ?? 'null')
      archThemeStatus.set(t.archetype_id, cur)
    }
  }

  // load all dark events (SEC subtheme, no trigger_theme_id, not exploratory)
  const { data: darkEvents } = await supabaseAdmin
    .from('events')
    .select('id, mentioned_tickers, classifier_reasoning, headline, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .eq('level_of_impact', 'subtheme')
    .is('trigger_theme_id', null)

  const darkMatchEvents = (darkEvents ?? []).filter((e) => {
    return e.classifier_reasoning && !e.classifier_reasoning.startsWith('[8-K exploratory')
  })
  console.log(`dark match events: ${darkMatchEvents.length}`)

  // cluster dark events by archetype typical_tickers overlap
  type ArchMatch = { archetype_id: string; name: string; name_zh: string | null; is_active: boolean; has_active_theme: boolean; match_events: Array<{ id: string; headline: string | null; tickers: string[]; date: string | null }>; unique_tickers: Set<string> }
  const byArch = new Map<string, ArchMatch>()
  const unmatched: typeof darkMatchEvents = []

  function flattenTickers(tt: unknown): string[] {
    if (!tt) return []
    if (Array.isArray(tt)) return tt.filter((x): x is string => typeof x === 'string')
    if (typeof tt === 'object') {
      const out: string[] = []
      for (const [k, v] of Object.entries(tt as Record<string, unknown>)) {
        if (k === 'dynamic') continue
        if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === 'string'))
      }
      return out
    }
    return []
  }

  for (const ev of darkMatchEvents) {
    const evTickers: string[] = ev.mentioned_tickers ?? []
    let best: { arch: typeof archs[number]; overlap: number } | null = null
    for (const a of archs) {
      if (a.deprecated) continue
      const archTickers: string[] = flattenTickers(a.typical_tickers)
      if (archTickers.length === 0) continue
      const overlap = evTickers.filter((t) => archTickers.includes(t)).length
      if (overlap > 0 && (!best || overlap > best.overlap)) {
        best = { arch: a, overlap }
      }
    }
    if (!best) {
      unmatched.push(ev)
      continue
    }
    const key = best.arch.id
    let cur = byArch.get(key)
    if (!cur) {
      cur = {
        archetype_id: key,
        name: best.arch.name,
        name_zh: best.arch.name_zh,
        is_active: !!best.arch.is_active,
        has_active_theme: activeArchIds.has(key),
        match_events: [],
        unique_tickers: new Set<string>(),
      }
      byArch.set(key, cur)
    }
    cur.match_events.push({ id: ev.id, headline: ev.headline, tickers: evTickers, date: ev.event_date })
    for (const t of evTickers) cur.unique_tickers.add(t)
  }

  // rank dark archetypes (no active theme)
  const dark = Array.from(byArch.values())
    .filter((a) => !a.has_active_theme)
    .sort((a, b) => b.match_events.length - a.match_events.length)
  console.log(`\n=== dark archetypes (no active/cooling theme) · ranked by event count ===`)
  for (const a of dark) {
    const statuses = archThemeStatus.get(a.archetype_id) ?? []
    console.log(`\n[${a.match_events.length} events · ${a.unique_tickers.size} tickers] ${a.archetype_id}`)
    console.log(`  name: ${a.name} / ${a.name_zh ?? '-'}`)
    console.log(`  is_active archetype flag: ${a.is_active} · existing theme statuses: ${statuses.length ? statuses.join(',') : 'none'}`)
    console.log(`  tickers: ${Array.from(a.unique_tickers).sort().join(', ')}`)
    const dates = a.match_events.map((e) => e.date).filter(Boolean).sort()
    if (dates.length) console.log(`  date range: ${dates[0]} → ${dates[dates.length - 1]}`)
  }

  // also show archetypes that DO have an active theme (matched events)
  console.log(`\n\n=== archetypes WITH active theme (for reference · these should have trigger set but didn't) ===`)
  const withTheme = Array.from(byArch.values())
    .filter((a) => a.has_active_theme)
    .sort((a, b) => b.match_events.length - a.match_events.length)
  for (const a of withTheme.slice(0, 10)) {
    console.log(`  ${a.archetype_id}: ${a.match_events.length} match events (should be attached · review)`)
  }

  // unmatched
  console.log(`\n\n=== unmatched · ${unmatched.length} events with no ticker overlap to any archetype ===`)
  for (const e of unmatched.slice(0, 5)) {
    console.log(`  ${e.id}: tickers=${JSON.stringify(e.mentioned_tickers)} headline=${e.headline?.slice(0, 60)}`)
  }

  // --- C.2d: show each active theme's ratio + snapshot + stage reason ---
  console.log(`\n\n=== C.2d · per-theme diagnostic (active themes) ===`)
  const archById = new Map<string, typeof archs[number]>()
  for (const a of archs) archById.set(a.id, a)

  const { data: activeThemes } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id, current_cycle_stage, first_event_at, created_at')
    .eq('status', 'active')
  const now = Date.now()

  const rows: Array<{ name: string; stage: string; days: number; typicalMax: number | null; ratio: number | null; snapshot: string | null }> = []
  for (const t of activeThemes ?? []) {
    const arch = t.archetype_id ? archById.get(t.archetype_id) : null
    const pb = (arch?.playbook as Record<string, unknown> | null) ?? null
    const rwt = (pb?.real_world_timeline as Record<string, unknown> | null) ?? null
    const snapshot = (rwt?.current_maturity_estimate as string | null) ?? null
    const typicalMax = arch?.typical_duration_days_max ?? null
    const first = t.first_event_at ? new Date(t.first_event_at).getTime() : new Date(t.created_at).getTime()
    const days = Math.floor((now - first) / 86400000)
    const ratio = typicalMax && typicalMax > 0 ? days / typicalMax : null
    rows.push({
      name: t.name,
      stage: t.current_cycle_stage ?? 'null',
      days,
      typicalMax,
      ratio,
      snapshot,
    })
  }

  // group by how the stage was driven
  const snapshotBuckets: Record<string, number> = {}
  let drivenByRatio = 0
  let drivenBySnapshot = 0
  for (const r of rows) {
    if (r.ratio !== null && r.ratio > 0.30) drivenByRatio++
    else if (r.snapshot) {
      drivenBySnapshot++
      snapshotBuckets[r.snapshot] = (snapshotBuckets[r.snapshot] ?? 0) + 1
    }
  }
  console.log(`\nstage driver distribution:`)
  console.log(`  driven_by_ratio (ratio > 0.30): ${drivenByRatio}`)
  console.log(`  driven_by_snapshot: ${drivenBySnapshot}`)
  console.log(`  snapshot values: ${JSON.stringify(snapshotBuckets)}`)

  // print each active theme
  rows.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
  console.log(`\nactive themes (sorted by ratio desc):`)
  for (const r of rows) {
    console.log(`  [${r.stage}] ratio=${r.ratio?.toFixed(3) ?? 'null'} days=${r.days} typicalMax=${r.typicalMax} snapshot=${r.snapshot} · ${r.name}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
