import { config } from 'dotenv'
config({ path: '.env.local' })

import { writeFileSync, mkdirSync, existsSync } from 'fs'

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, archetype_id, current_cycle_stage, first_event_at, created_at, cycle_stage_computed_at')
    .eq('status', 'active')
    .order('name')

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('source_name, trigger_theme_id, event_date, created_at')

  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_duration_days_max, name')

  if (!themes || !events || !archetypes) {
    console.error('fetch failed')
    process.exit(1)
  }

  const now = Date.now()

  const firstByTheme = new Map<string, number>()
  for (const e of events) {
    if (!e.trigger_theme_id || !e.event_date) continue
    const t = new Date(e.event_date).getTime()
    if (!Number.isFinite(t)) continue
    const cur = firstByTheme.get(e.trigger_theme_id)
    if (cur === undefined || t < cur) firstByTheme.set(e.trigger_theme_id, t)
  }

  const themesWithDays = themes.map((t) => {
    const ms = firstByTheme.get(t.id) ?? (t.first_event_at ? new Date(t.first_event_at).getTime() : new Date(t.created_at).getTime())
    const days = Math.floor((now - ms) / 86400000)
    return {
      id: t.id,
      name: t.name,
      archetype_id: t.archetype_id,
      current_cycle_stage: t.current_cycle_stage,
      days_since_first_event: days,
      first_event_at: new Date(ms).toISOString().slice(0, 10),
    }
  })

  const sourceDist: Record<string, { count: number; first: string; last: string }> = {}
  for (const e of events) {
    const s = e.source_name ?? '(null)'
    if (!sourceDist[s]) sourceDist[s] = { count: 0, first: e.created_at, last: e.created_at }
    sourceDist[s].count++
    if (e.created_at < sourceDist[s].first) sourceDist[s].first = e.created_at
    if (e.created_at > sourceDist[s].last) sourceDist[s].last = e.created_at
  }

  const stageDist: Record<string, number> = {}
  for (const t of themes) {
    const s = t.current_cycle_stage ?? 'null'
    stageDist[s] = (stageDist[s] ?? 0) + 1
  }

  const snapshot = {
    snapshot_at: new Date().toISOString(),
    totals: {
      active_themes: themes.length,
      events: events.length,
      archetypes: archetypes.length,
    },
    stage_distribution: stageDist,
    source_distribution: Object.entries(sourceDist)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([source_name, v]) => ({ source_name, ...v })),
    themes: themesWithDays,
  }

  if (!existsSync('data')) mkdirSync('data')
  writeFileSync('data/pre-backfill-snapshot.json', JSON.stringify(snapshot, null, 2))

  console.log('Pre-backfill snapshot:')
  console.log(`  snapshot_at:       ${snapshot.snapshot_at}`)
  console.log(`  active_themes:     ${snapshot.totals.active_themes}`)
  console.log(`  total events:      ${snapshot.totals.events}`)
  console.log(`  archetypes:        ${snapshot.totals.archetypes}`)
  console.log('\n  Stage distribution:')
  for (const [k, v] of Object.entries(stageDist)) console.log(`    ${k.padEnd(6)} ${v}`)
  console.log('\n  Source distribution (top 10):')
  for (const row of snapshot.source_distribution.slice(0, 10)) {
    console.log(`    ${row.source_name.slice(0, 50).padEnd(50)} ${String(row.count).padStart(5)}`)
  }
  console.log(`\n  days_since_first_event · active themes:`)
  const days = themesWithDays.map((t) => t.days_since_first_event).sort((a, b) => a - b)
  const p = (q: number) => days[Math.floor(days.length * q)] ?? 0
  console.log(`    min=${days[0]} p25=${p(0.25)} p50=${p(0.5)} p75=${p(0.75)} max=${days[days.length - 1]}`)
  console.log(`\nSaved to data/pre-backfill-snapshot.json`)
}

main().catch((e) => { console.error(e); process.exit(1) })
