import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const isDryRun = process.argv.includes('--dry-run')
  const isExecute = process.argv.includes('--execute')

  if (!isDryRun && !isExecute) {
    console.error('Pass --dry-run or --execute')
    process.exit(1)
  }

  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { computeThemeStrength } = await import('../lib/compute-theme-strength')

  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, theme_strength_score, event_count')
    .in('status', ['active', 'cooling', 'archived'])
  if (error) throw new Error(error.message)

  console.log(`mode: ${isDryRun ? 'DRY-RUN' : 'EXECUTE'}`)
  console.log(`themes to process: ${themes?.length ?? 0}\n`)

  const edgeCases: string[] = []
  const rows: { name: string; old: number; new: number; delta: number; events: number; sources: number }[] = []

  let i = 0
  for (const t of themes ?? []) {
    i++
    const { data: events, error: evErr } = await supabaseAdmin
      .from('events')
      .select('event_date, level_of_impact, source_name')
      .eq('trigger_theme_id', t.id)

    if (evErr) {
      edgeCases.push(`  [err] ${t.id} ${t.name}: ${evErr.message}`)
      continue
    }

    const valid = (events ?? []).filter((e) => e.event_date)
    if (valid.length === 0) {
      edgeCases.push(`  [no-events] ${t.name} (status=${t.status})`)
    }

    const result = computeThemeStrength(events ?? [])
    const old = t.theme_strength_score ?? 0
    const delta = Math.round((result.strength - old) * 10) / 10

    rows.push({
      name: t.name,
      old,
      new: result.strength,
      delta,
      events: result.event_count,
      sources: result.unique_sources,
    })

    if (!isDryRun) {
      const { error: upErr } = await supabaseAdmin
        .from('themes')
        .update({
          theme_strength_score: result.strength,
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id)
      if (upErr) edgeCases.push(`  [update-err] ${t.id}: ${upErr.message}`)
    }

    if (i % 10 === 0) console.log(`  progress: ${i}/${themes?.length ?? 0}`)
  }

  console.log(`\n=== before / after top 10 by new strength ===`)
  const topNew = [...rows].sort((a, b) => b.new - a.new).slice(0, 10)
  for (const r of topNew) {
    console.log(
      `  ${r.name.padEnd(60).slice(0, 60)}  ${String(r.old).padStart(5)} → ${String(r.new).padStart(6)}  (${r.delta >= 0 ? '+' : ''}${r.delta})  ev=${r.events} src=${r.sources}`
    )
  }

  const increased = rows.filter((r) => r.delta >= 3).length
  const decreased = rows.filter((r) => r.delta <= -3).length
  const unchanged = rows.length - increased - decreased
  const sat = rows.filter((r) => r.new >= 95).length

  console.log(`\n=== summary ===`)
  console.log(`  total:      ${rows.length}`)
  console.log(`  ↑ (Δ≥+3):  ${increased}`)
  console.log(`  ↓ (Δ≤−3):  ${decreased}`)
  console.log(`  unchanged:  ${unchanged}`)
  console.log(`  ≥95:        ${sat}`)

  if (edgeCases.length) {
    console.log(`\n=== edge cases ===`)
    for (const e of edgeCases) console.log(e)
  }

  console.log(`\n${isDryRun ? 'DRY-RUN done — no writes.' : 'EXECUTE done — DB updated.'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
