import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // --- A: dark archetype events probe ---
  console.log('=== A · dark archetype sample (SEC subtheme · trigger_theme_id null) ===')
  const { data: sample } = await supabaseAdmin
    .from('events')
    .select('id, source_name, level_of_impact, trigger_theme_id, mentioned_tickers, classifier_reasoning, headline, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .eq('level_of_impact', 'subtheme')
    .is('trigger_theme_id', null)
    .limit(3)
  for (const row of sample ?? []) {
    console.log(`\nid=${row.id}`)
    console.log(`  headline=${row.headline?.slice(0, 80)}`)
    console.log(`  tickers=${JSON.stringify(row.mentioned_tickers)}`)
    console.log(`  reasoning=${row.classifier_reasoning}`)
    console.log(`  date=${row.event_date}`)
  }

  // --- look for other columns that might carry archetype_id ---
  const { data: one } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .eq('level_of_impact', 'subtheme')
    .limit(1)
  if (one?.[0]) {
    console.log(`\n=== event columns: ${Object.keys(one[0]).sort().join(', ')}`)
  }

  // --- A.2: theme_archetypes table ---
  console.log('\n=== A.2 · theme_archetypes table ===')
  const { data: ta, error: taErr } = await supabaseAdmin.from('theme_archetypes').select('*').limit(1)
  console.log(`err=${taErr?.message ?? 'none'} rows=${ta?.length}`)
  if (ta?.[0]) console.log(`cols: ${Object.keys(ta[0]).sort().join(', ')}`)
  const { count: taCount } = await supabaseAdmin.from('theme_archetypes').select('*', { count: 'exact', head: true })
  console.log(`theme_archetypes count=${taCount}`)

  // --- C.2: cycle stage diagnostic ---
  console.log('\n=== C.2 · cycle_stage diagnostic ===')
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id, current_cycle_stage, first_event_at, created_at')
    .eq('status', 'active')
  const now = Date.now()
  const byStage: Record<string, { count: number; days: number[] }> = { early: { count: 0, days: [] }, mid: { count: 0, days: [] }, late: { count: 0, days: [] }, exit: { count: 0, days: [] }, null: { count: 0, days: [] } }
  const archetypeIds = new Set<string>()
  for (const t of themes ?? []) {
    if (t.archetype_id) archetypeIds.add(t.archetype_id)
    const first = t.first_event_at ? new Date(t.first_event_at).getTime() : new Date(t.created_at).getTime()
    const days = Math.floor((now - first) / 86400000)
    const key = t.current_cycle_stage ?? 'null'
    byStage[key].count++
    byStage[key].days.push(days)
  }
  for (const [stage, v] of Object.entries(byStage)) {
    if (v.count === 0) continue
    const avg = v.days.reduce((a, b) => a + b, 0) / v.count
    const min = Math.min(...v.days)
    const max = Math.max(...v.days)
    console.log(`  ${stage}: n=${v.count} days avg=${avg.toFixed(1)} min=${min} max=${max}`)
  }

  // load archetype duration data for active themes
  const { data: archs } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_duration_days_min, typical_duration_days_max, playbook')
    .in('id', Array.from(archetypeIds))
  const archById = new Map<string, typeof archs[number]>()
  for (const a of archs ?? []) archById.set(a.id, a)

  console.log('\n=== C.2b · ratio distribution (active themes) ===')
  const ratioByStage: Record<string, number[]> = { early: [], mid: [], late: [], exit: [], null: [] }
  const noDurationCount = { count: 0, stages: [] as string[] }
  for (const t of themes ?? []) {
    const arch = t.archetype_id ? archById.get(t.archetype_id) : null
    const typicalMax = arch?.typical_duration_days_max ?? null
    const first = t.first_event_at ? new Date(t.first_event_at).getTime() : new Date(t.created_at).getTime()
    const days = Math.floor((now - first) / 86400000)
    const ratio = typicalMax && typicalMax > 0 ? days / typicalMax : null
    const key = t.current_cycle_stage ?? 'null'
    if (ratio === null) {
      noDurationCount.count++
      noDurationCount.stages.push(key)
    } else {
      ratioByStage[key].push(ratio)
    }
  }
  for (const [stage, arr] of Object.entries(ratioByStage)) {
    if (arr.length === 0) continue
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length
    const min = Math.min(...arr)
    const max = Math.max(...arr)
    console.log(`  ${stage}: n=${arr.length} ratio avg=${avg.toFixed(2)} min=${min.toFixed(2)} max=${max.toFixed(2)}`)
  }
  console.log(`  no_duration: n=${noDurationCount.count} (stages: ${noDurationCount.stages.join(', ')})`)

  // list archetype typical_duration_days_max for all active theme archetypes
  console.log('\n=== C.2c · typical_duration_days_max for active archetypes ===')
  const durations = Array.from(archById.values())
    .map((a) => ({ id: a.id, min: a.typical_duration_days_min, max: a.typical_duration_days_max }))
    .sort((a, b) => (a.max ?? 0) - (b.max ?? 0))
  for (const d of durations) {
    console.log(`  ${d.id}: min=${d.min} max=${d.max}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
