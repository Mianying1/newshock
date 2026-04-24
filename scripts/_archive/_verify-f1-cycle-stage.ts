import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, archetype_id, first_event_at, created_at, current_cycle_stage')
    .eq('status', 'active')

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('trigger_theme_id, event_date, created_at')

  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_duration_days_max, playbook')

  if (!themes || !events || !archetypes) {
    console.error('fetch failed')
    process.exit(1)
  }

  const typicalMax: Record<string, number | null> = {}
  const snapshotBy: Record<string, string | null> = {}
  for (const a of archetypes) {
    typicalMax[a.id] = a.typical_duration_days_max ?? null
    const pb = a.playbook as Record<string, unknown> | null
    const rwt = (pb?.real_world_timeline ?? null) as Record<string, unknown> | null
    snapshotBy[a.id] = (rwt?.current_maturity_estimate ?? null) as string | null
  }

  const firstOld = new Map<string, number>()
  const firstNew = new Map<string, number>()
  for (const e of events) {
    if (!e.trigger_theme_id) continue
    const old = new Date(e.created_at).getTime()
    if (Number.isFinite(old)) {
      const cur = firstOld.get(e.trigger_theme_id)
      if (cur === undefined || old < cur) firstOld.set(e.trigger_theme_id, old)
    }
    if (e.event_date) {
      const nw = new Date(e.event_date).getTime()
      if (Number.isFinite(nw)) {
        const cur = firstNew.get(e.trigger_theme_id)
        if (cur === undefined || nw < cur) firstNew.set(e.trigger_theme_id, nw)
      }
    }
  }

  const RATIO_MID = 0.3, RATIO_LATE = 0.75, RATIO_EXIT = 1.5
  function classify(ratio: number | null, snapshot: string | null): string {
    if (ratio === null) {
      if (snapshot === 'beyond_typical') return 'exit'
      if (snapshot === 'late') return 'late'
      if (snapshot === 'mid') return 'mid'
      if (snapshot === 'early') return 'early'
      return 'null'
    }
    if (snapshot === 'beyond_typical') return 'exit'
    if (ratio > RATIO_EXIT) return 'exit'
    if (ratio > RATIO_LATE) return 'late'
    if (snapshot === 'late') return 'late'
    if (ratio > RATIO_MID) return 'mid'
    if (snapshot === 'mid') return 'mid'
    return 'early'
  }

  const now = Date.now()
  const rows: Array<{ name: string; daysOld: number; daysNew: number; stageOld: string; stageNew: string; diff: number }> = []

  for (const t of themes) {
    const msOld = firstOld.get(t.id) ?? (t.first_event_at ? new Date(t.first_event_at).getTime() : null) ?? new Date(t.created_at).getTime()
    const msNew = firstNew.get(t.id) ?? (t.first_event_at ? new Date(t.first_event_at).getTime() : null) ?? new Date(t.created_at).getTime()
    const daysOld = Math.floor((now - msOld) / 86400000)
    const daysNew = Math.floor((now - msNew) / 86400000)
    const tmax = t.archetype_id ? typicalMax[t.archetype_id] : null
    const snap = t.archetype_id ? snapshotBy[t.archetype_id] : null
    const rOld = tmax && tmax > 0 ? daysOld / tmax : null
    const rNew = tmax && tmax > 0 ? daysNew / tmax : null
    rows.push({
      name: t.name,
      daysOld,
      daysNew,
      stageOld: classify(rOld, snap),
      stageNew: classify(rNew, snap),
      diff: daysNew - daysOld,
    })
  }

  rows.sort((a, b) => b.diff - a.diff)

  console.log(`active themes: ${themes.length}\n`)
  console.log('theme                                                   daysOld  daysNew  Δ     stageOld → stageNew')
  console.log('-'.repeat(110))
  for (const r of rows) {
    const marker = r.stageOld !== r.stageNew ? '★' : ' '
    console.log(
      `${marker} ${r.name.slice(0, 50).padEnd(50)}  ${String(r.daysOld).padStart(5)}   ${String(r.daysNew).padStart(5)}   ${(r.diff >= 0 ? '+' : '') + r.diff}    ${r.stageOld.padEnd(8)} → ${r.stageNew}`
    )
  }

  const distOld: Record<string, number> = {}
  const distNew: Record<string, number> = {}
  for (const r of rows) {
    distOld[r.stageOld] = (distOld[r.stageOld] ?? 0) + 1
    distNew[r.stageNew] = (distNew[r.stageNew] ?? 0) + 1
  }

  console.log('\nDistribution:')
  console.log(`  stage   old → new`)
  for (const k of ['early', 'mid', 'late', 'exit', 'null']) {
    const o = distOld[k] ?? 0, n = distNew[k] ?? 0
    const delta = n - o
    console.log(`  ${k.padEnd(7)} ${String(o).padStart(3)} → ${String(n).padStart(3)}  (${delta >= 0 ? '+' : ''}${delta})`)
  }

  const changed = rows.filter((r) => r.stageOld !== r.stageNew).length
  console.log(`\nstage-change themes: ${changed} / ${rows.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
