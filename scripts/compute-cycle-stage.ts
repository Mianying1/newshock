import { config } from 'dotenv'
import { pathToFileURL } from 'node:url'

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
  current_cycle_stage: string | null
  cycle_stage_computed_at: string | null
}

type AlertSeverity = 'info' | 'warn' | 'critical'

function severityFor(from: string | null, to: string): AlertSeverity {
  if (from === 'late' && to === 'exit') return 'critical'
  if ((from === 'early' && to === 'mid') || (from === 'mid' && to === 'late')) return 'warn'
  return 'info'
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

export interface ComputeCycleStageStats {
  themes_updated: number
  null_stage: number
  distribution: Record<string, number>
  alerts_inserted: number
  alerts_deduped: number
  alerts_cold_start_suppressed: number
  alert_severity_distribution: Record<string, number>
}

export async function runComputeCycleStage(): Promise<ComputeCycleStageStats> {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const [themes, archetypes, events] = await Promise.all([
    fetchAll<Theme>('themes', 'id, name, status, archetype_id, first_event_at, created_at, current_cycle_stage, cycle_stage_computed_at'),
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

  const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000
  let updated = 0
  let nullCnt = 0
  let alertsInserted = 0
  let alertsDeduped = 0
  let alertsColdStart = 0
  const alertDistribution: Record<string, number> = { info: 0, warn: 0, critical: 0 }
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

    const oldStage = theme.current_cycle_stage
    const changed = oldStage !== null && stage !== null && oldStage !== stage

    if (oldStage === null && stage !== null) alertsColdStart++

    if (changed) {
      const sinceIso = new Date(now - DEDUP_WINDOW_MS).toISOString()
      const { data: recent, error: dedupErr } = await supabaseAdmin
        .from('theme_alerts')
        .select('id')
        .eq('theme_id', theme.id)
        .eq('alert_type', 'stage_change')
        .eq('from_stage', oldStage)
        .eq('to_stage', stage)
        .gte('created_at', sinceIso)
        .limit(1)
      if (dedupErr) throw new Error(`DEDUP ${theme.id}: ${dedupErr.message}`)

      if (recent && recent.length > 0) {
        alertsDeduped++
      } else {
        const severity = severityFor(oldStage, stage as string)
        const { error: alertErr } = await supabaseAdmin.from('theme_alerts').insert({
          theme_id: theme.id,
          alert_type: 'stage_change',
          from_stage: oldStage,
          to_stage: stage,
          reason,
          ratio,
          days_since_first_event: days,
          severity,
        })
        if (alertErr) throw new Error(`ALERT ${theme.id}: ${alertErr.message}`)
        alertsInserted++
        alertDistribution[severity]++
        console.log(`  alert [${severity}] ${theme.name} · ${oldStage} → ${stage} · ratio=${ratio?.toFixed(2) ?? '-'}`)
      }
    }

    const { error } = await supabaseAdmin
      .from('themes')
      .update({
        current_cycle_stage: stage,
        cycle_stage_computed_at: nowIso,
        previous_cycle_stage: oldStage,
        previous_cycle_stage_at: theme.cycle_stage_computed_at,
      })
      .eq('id', theme.id)
    if (error) throw new Error(`UPDATE ${theme.id}: ${error.message}`)
    updated++
  }

  console.log(`\nalerts: inserted=${alertsInserted} · deduped=${alertsDeduped} · cold_start_suppressed=${alertsColdStart}`)
  console.log(`severity dist: info=${alertDistribution.info} warn=${alertDistribution.warn} critical=${alertDistribution.critical}`)

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

  return {
    themes_updated: updated,
    null_stage: nullCnt,
    distribution,
    alerts_inserted: alertsInserted,
    alerts_deduped: alertsDeduped,
    alerts_cold_start_suppressed: alertsColdStart,
    alert_severity_distribution: alertDistribution,
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  runComputeCycleStage().catch((e) => { console.error(e); process.exit(1) })
}
