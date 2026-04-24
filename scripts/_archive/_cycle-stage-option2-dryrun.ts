import { config } from 'dotenv'
config({ path: '.env.local' })

const RATIO_MID = 0.3
const RATIO_LATE = 0.75
const RATIO_EXIT = 1.5
// Option 2 caps
const CAP_EARLY = 0.10
const CAP_MID = 0.30

type Stage = 'early' | 'mid' | 'late' | 'exit' | null
const order: Record<Exclude<Stage, null>, number> = { early: 1, mid: 2, late: 3, exit: 4 }

function currentClassify(ratio: number | null, snapshot: string | null): Stage {
  if (ratio === null) {
    if (snapshot === 'beyond_typical') return 'exit'
    if (snapshot === 'late') return 'late'
    if (snapshot === 'mid') return 'mid'
    if (snapshot === 'early') return 'early'
    return null
  }
  if (snapshot === 'beyond_typical') return 'exit'
  if (ratio > RATIO_EXIT) return 'exit'
  if (ratio > RATIO_LATE) return 'late'
  if (snapshot === 'late') return 'late'
  if (ratio > RATIO_MID) return 'mid'
  if (snapshot === 'mid') return 'mid'
  return 'early'
}

// Option 2 · cap snapshot by ratio bucket (never upgrade past cap, ratio-derived stage still wins when higher)
function option2Classify(ratio: number | null, snapshot: string | null): Stage {
  const base = currentClassify(ratio, snapshot)
  if (base === null) return null
  if (ratio === null) return base // no cap when no duration data
  // cap never affects stages derived from ratio itself (ratio>0.30)
  // cap only applies if snapshot drove the classification
  let cap: Stage = null
  if (ratio < CAP_EARLY) cap = 'early'
  else if (ratio < CAP_MID) cap = 'mid'
  if (cap === null) return base
  // if base is higher than cap · downgrade to cap
  if (order[base as Exclude<Stage, null>] > order[cap as Exclude<Stage, null>]) return cap
  return base
}

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id, status, current_cycle_stage, first_event_at, created_at')
    .in('status', ['active', 'cooling'])

  const archIds = Array.from(new Set((themes ?? []).map((t) => t.archetype_id).filter((x): x is string => !!x)))
  const { data: archs } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_duration_days_max, playbook')
    .in('id', archIds)
  const archById = new Map<string, typeof archs[number]>()
  for (const a of archs ?? []) archById.set(a.id, a)

  const now = Date.now()

  const currentDist: Record<string, number> = { early: 0, mid: 0, late: 0, exit: 0, null: 0 }
  const option2Dist: Record<string, number> = { early: 0, mid: 0, late: 0, exit: 0, null: 0 }
  const transitions: Record<string, number> = {}
  const changes: Array<{ name: string; days: number; ratio: number | null; snapshot: string | null; from: string; to: string }> = []

  for (const t of themes ?? []) {
    if (t.status !== 'active') continue // only active; cooling not reclassified by cycle-stage
    const arch = t.archetype_id ? archById.get(t.archetype_id) : null
    const pb = (arch?.playbook as Record<string, unknown> | null) ?? null
    const rwt = (pb?.real_world_timeline as Record<string, unknown> | null) ?? null
    const snapshot = (rwt?.current_maturity_estimate as string | null) ?? null
    const typicalMax = arch?.typical_duration_days_max ?? null
    const first = t.first_event_at ? new Date(t.first_event_at).getTime() : new Date(t.created_at).getTime()
    const days = Math.floor((now - first) / 86400000)
    const ratio = typicalMax && typicalMax > 0 ? days / typicalMax : null

    const curr = currentClassify(ratio, snapshot)
    const opt2 = option2Classify(ratio, snapshot)
    currentDist[curr ?? 'null']++
    option2Dist[opt2 ?? 'null']++
    const key = `${curr ?? 'null'} → ${opt2 ?? 'null'}`
    transitions[key] = (transitions[key] ?? 0) + 1
    if (curr !== opt2) {
      changes.push({ name: t.name, days, ratio, snapshot, from: curr ?? 'null', to: opt2 ?? 'null' })
    }
  }

  console.log(`=== current distribution (active themes) ===`)
  for (const [k, v] of Object.entries(currentDist)) if (v > 0) console.log(`  ${k}: ${v}`)

  console.log(`\n=== Option 2 distribution (ratio<0.10 → early cap · ratio<0.30 → mid cap) ===`)
  for (const [k, v] of Object.entries(option2Dist)) if (v > 0) console.log(`  ${k}: ${v}`)

  console.log(`\n=== transitions ===`)
  for (const [k, v] of Object.entries(transitions).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)

  console.log(`\n=== themes that change (${changes.length}) ===`)
  changes.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
  for (const c of changes) {
    console.log(`  [${c.from}→${c.to}] ratio=${c.ratio?.toFixed(3) ?? 'null'} days=${c.days} snap=${c.snapshot} · ${c.name}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
