import { config } from 'dotenv'
config({ path: '.env.local' })

type Theme = {
  id: string
  name: string
  status: string
  archetype_id: string | null
  current_cycle_stage: string | null
  cycle_stage_computed_at: string | null
  first_event_at: string | null
  created_at: string
}

type Archetype = {
  id: string
  typical_duration_days_min: number | null
  typical_duration_days_max: number | null
  playbook: Record<string, unknown> | null
}

type Event = { trigger_theme_id: string | null; created_at: string }

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const all: T[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabaseAdmin.from(table).select(cols).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as unknown as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  const [themes, archetypes, events] = await Promise.all([
    fetchAll<Theme>('themes', 'id, name, status, archetype_id, current_cycle_stage, cycle_stage_computed_at, first_event_at, created_at'),
    fetchAll<Archetype>('theme_archetypes', 'id, typical_duration_days_min, typical_duration_days_max, playbook'),
    fetchAll<Event>('events', 'trigger_theme_id, created_at'),
  ])

  const archById = new Map<string, Archetype>()
  for (const a of archetypes) archById.set(a.id, a)

  const firstEventByTheme = new Map<string, number>()
  for (const e of events) {
    if (!e.trigger_theme_id) continue
    const tms = new Date(e.created_at).getTime()
    const cur = firstEventByTheme.get(e.trigger_theme_id)
    if (cur === undefined || tms < cur) firstEventByTheme.set(e.trigger_theme_id, tms)
  }

  const now = Date.now()
  const activeThemes = themes.filter((t) => t.status === 'active')

  type Row = {
    id: string
    name: string
    stage: string | null
    snapshot: string | null
    days: number
    typical_min: number | null
    typical_max: number | null
    ratio: number | null
    has_archetype: boolean
    has_events: boolean
  }

  const rows: Row[] = activeThemes.map((t) => {
    const arch = t.archetype_id ? archById.get(t.archetype_id) : null
    const pb = (arch?.playbook ?? null) as Record<string, unknown> | null
    const rwt = (pb?.real_world_timeline ?? null) as Record<string, unknown> | null
    const snapshot = (rwt?.current_maturity_estimate ?? null) as string | null
    const firstMs = firstEventByTheme.get(t.id)
      ?? (t.first_event_at ? new Date(t.first_event_at).getTime() : null)
      ?? new Date(t.created_at).getTime()
    const days = Math.floor((now - firstMs) / (86400 * 1000))
    const max = arch?.typical_duration_days_max ?? null
    const ratio = max && max > 0 ? days / max : null
    return {
      id: t.id,
      name: t.name,
      stage: t.current_cycle_stage,
      snapshot,
      days,
      typical_min: arch?.typical_duration_days_min ?? null,
      typical_max: max,
      ratio,
      has_archetype: !!arch,
      has_events: firstEventByTheme.has(t.id),
    }
  })

  // Distribution
  const dist: Record<string, number> = { early: 0, mid: 0, late: 0, exit: 0, null: 0 }
  for (const r of rows) dist[r.stage ?? 'null']++

  console.log('=== Cycle Stage Verification ===\n')
  console.log(`active themes: ${rows.length}`)
  console.log(`computed_at set: ${activeThemes.filter((t) => t.cycle_stage_computed_at !== null).length}`)
  console.log('\ndistribution:')
  for (const k of ['early', 'mid', 'late', 'exit', 'null']) {
    const pct = ((dist[k] / rows.length) * 100).toFixed(0)
    console.log(`  ${k.padEnd(6)}: ${String(dist[k]).padStart(2)} (${pct}%)`)
  }

  // Null reasons
  const nullRows = rows.filter((r) => r.stage === null)
  if (nullRows.length > 0) {
    console.log(`\nNULL stage reasons (${nullRows.length}):`)
    let noArch = 0, noMax = 0, noSnapshotNoRatio = 0
    for (const r of nullRows) {
      if (!r.has_archetype) noArch++
      else if (r.typical_max === null) noMax++
      else if (r.snapshot === null) noSnapshotNoRatio++
    }
    console.log(`  no archetype:           ${noArch}`)
    console.log(`  archetype · no typical_max: ${noMax}`)
    console.log(`  has max · no snapshot (shouldn't happen): ${noSnapshotNoRatio}`)
    for (const r of nullRows) {
      console.log(`  - ${r.name} · archetype_has=${r.has_archetype} · typical_max=${r.typical_max} · snapshot=${r.snapshot ?? 'null'}`)
    }
  }

  // Stage breakdown with samples (up to 5 each)
  for (const stage of ['early', 'mid', 'late', 'exit']) {
    const sub = rows.filter((r) => r.stage === stage)
    if (sub.length === 0) continue
    sub.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
    console.log(`\n${stage} (${sub.length}):`)
    for (const r of sub.slice(0, 5)) {
      console.log(`  ${r.name.slice(0, 60).padEnd(60)} days=${r.days} max=${r.typical_max ?? '-'} ratio=${r.ratio?.toFixed(2) ?? '-'} snap=${r.snapshot ?? '-'}`)
    }
    if (sub.length > 5) console.log(`  ... +${sub.length - 5} more`)
  }

  // Conflicts: snapshot says early but ratio/rule pushed higher
  const snapshotRuleConflicts = rows.filter((r) => r.stage && r.snapshot === 'early' && (r.stage === 'late' || r.stage === 'exit'))
  if (snapshotRuleConflicts.length > 0) {
    console.log(`\nconflict · snapshot=early but stage=late/exit (${snapshotRuleConflicts.length}):`)
    for (const r of snapshotRuleConflicts) {
      console.log(`  ${r.name} · stage=${r.stage} · days=${r.days} · ratio=${r.ratio?.toFixed(2)} · snapshot=early`)
    }
  } else {
    console.log('\nconflicts: none')
  }

  // Data health: themes stuck at ratio=0 (no real-world signal yet)
  const zeroRatio = rows.filter((r) => r.ratio !== null && r.ratio < 0.01).length
  console.log(`\ndata health: ${zeroRatio}/${rows.length} themes have ratio < 0.01 (very new · snapshot-dominated)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
