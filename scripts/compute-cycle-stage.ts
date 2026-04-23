import { config } from 'dotenv'
config({ path: '.env.local' })

// Thresholds per Phase 3 spec
const RATIO_MID = 0.3
const RATIO_LATE = 0.75
const RATIO_EXIT = 1.5

type Theme = {
  id: string
  name: string
  status: string
  archetype_id: string | null
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

type Stage = 'early' | 'mid' | 'late' | 'exit' | null

function classify(ratio: number | null, snapshot: string | null): { stage: Stage; reason: string } {
  if (ratio === null) {
    // Can only use snapshot
    if (snapshot === 'beyond_typical') return { stage: 'exit', reason: 'snapshot=beyond_typical · no duration data' }
    if (snapshot === 'late') return { stage: 'late', reason: 'snapshot=late · no duration data' }
    if (snapshot === 'mid') return { stage: 'mid', reason: 'snapshot=mid · no duration data' }
    if (snapshot === 'early') return { stage: 'early', reason: 'snapshot=early · no duration data' }
    return { stage: null, reason: 'no ratio and no snapshot' }
  }

  if (snapshot === 'beyond_typical') return { stage: 'exit', reason: `snapshot=beyond_typical (ratio=${ratio.toFixed(2)})` }
  if (ratio > RATIO_EXIT) return { stage: 'exit', reason: `ratio=${ratio.toFixed(2)} > ${RATIO_EXIT}` }

  if (ratio > RATIO_LATE) return { stage: 'late', reason: `ratio=${ratio.toFixed(2)} > ${RATIO_LATE}` }
  if (snapshot === 'late') return { stage: 'late', reason: `snapshot=late (ratio=${ratio.toFixed(2)})` }

  if (ratio > RATIO_MID) return { stage: 'mid', reason: `ratio=${ratio.toFixed(2)} > ${RATIO_MID}` }
  if (snapshot === 'mid') return { stage: 'mid', reason: `snapshot=mid (ratio=${ratio.toFixed(2)})` }

  return { stage: 'early', reason: `ratio=${ratio.toFixed(2)} · snapshot=${snapshot ?? 'null'}` }
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const [themes, archetypes, events] = await Promise.all([
    fetchAll<Theme>('themes', 'id, name, status, archetype_id, first_event_at, created_at'),
    fetchAll<Archetype>('theme_archetypes', 'id, typical_duration_days_min, typical_duration_days_max, playbook'),
    fetchAll<Event>('events', 'trigger_theme_id, created_at'),
  ])

  const archById = new Map<string, Archetype>()
  for (const a of archetypes) archById.set(a.id, a)

  // Earliest event per theme
  const firstEventByTheme = new Map<string, number>()
  for (const e of events) {
    if (!e.trigger_theme_id) continue
    const tms = new Date(e.created_at).getTime()
    const cur = firstEventByTheme.get(e.trigger_theme_id)
    if (cur === undefined || tms < cur) firstEventByTheme.set(e.trigger_theme_id, tms)
  }

  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  const activeThemes = themes.filter((t) => t.status === 'active')
  console.log(`computing cycle stage for ${activeThemes.length} active themes...`)

  let updated = 0
  let nullCnt = 0
  const distribution: Record<string, number> = { early: 0, mid: 0, late: 0, exit: 0, null: 0 }
  const detail: Array<{ id: string; name: string; stage: Stage; reason: string; days: number | null; typical_max: number | null; ratio: number | null; snapshot: string | null }> = []

  for (const theme of activeThemes) {
    const arch = theme.archetype_id ? archById.get(theme.archetype_id) : null
    const pb = (arch?.playbook ?? null) as Record<string, unknown> | null
    const rwt = (pb?.real_world_timeline ?? null) as Record<string, unknown> | null
    const snapshot = (rwt?.current_maturity_estimate ?? null) as string | null
    const typicalMax = arch?.typical_duration_days_max ?? null

    const firstMs = firstEventByTheme.get(theme.id)
      ?? (theme.first_event_at ? new Date(theme.first_event_at).getTime() : null)
      ?? new Date(theme.created_at).getTime()
    const days = Math.floor((now - firstMs) / (86400 * 1000))
    const ratio = typicalMax && typicalMax > 0 ? days / typicalMax : null

    const { stage, reason } = classify(ratio, snapshot)
    distribution[stage ?? 'null']++
    if (stage === null) nullCnt++

    detail.push({ id: theme.id, name: theme.name, stage, reason, days, typical_max: typicalMax, ratio, snapshot })

    const { error } = await supabaseAdmin
      .from('themes')
      .update({ current_cycle_stage: stage, cycle_stage_computed_at: nowIso })
      .eq('id', theme.id)
    if (error) {
      console.error(`UPDATE ${theme.id}: ${error.message}`)
      process.exit(1)
    }
    updated++
  }

  console.log(`\ndone · ${updated} themes updated · ${nullCnt} null stage`)
  console.log('\ndistribution:')
  for (const k of ['early', 'mid', 'late', 'exit', 'null']) {
    console.log(`  ${k.padEnd(6)}: ${distribution[k]}`)
  }

  // Sample per stage
  for (const stage of ['early', 'mid', 'late', 'exit', null] as Stage[]) {
    const key = stage ?? 'null'
    const sample = detail.filter((d) => d.stage === stage).slice(0, 3)
    if (sample.length === 0) continue
    console.log(`\n${key} samples:`)
    for (const s of sample) {
      console.log(`  "${s.name}" · days=${s.days} · typical_max=${s.typical_max} · ratio=${s.ratio?.toFixed(2) ?? 'N/A'} · snapshot=${s.snapshot ?? 'null'} · ${s.reason}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
