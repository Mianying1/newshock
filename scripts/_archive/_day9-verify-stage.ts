import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, current_cycle_stage, previous_cycle_stage')
    .in('status', ['active', 'cooling'])

  const byStatusStage: Record<string, Record<string, number>> = {}
  const changes: Array<{ from: string; to: string; name: string }> = []
  for (const t of data ?? []) {
    const st = t.status ?? 'null'
    const stage = t.current_cycle_stage ?? 'null'
    if (!byStatusStage[st]) byStatusStage[st] = {}
    byStatusStage[st][stage] = (byStatusStage[st][stage] ?? 0) + 1
    if (t.previous_cycle_stage && t.previous_cycle_stage !== t.current_cycle_stage) {
      changes.push({ from: t.previous_cycle_stage, to: t.current_cycle_stage ?? 'null', name: t.name })
    }
  }
  for (const [st, stages] of Object.entries(byStatusStage)) {
    console.log(`\n${st}:`)
    for (const [stage, n] of Object.entries(stages)) console.log(`  ${stage}: ${n}`)
  }
  console.log(`\n=== stage changes (${changes.length}) ===`)
  const transitionCount: Record<string, number> = {}
  for (const c of changes) {
    const k = `${c.from} → ${c.to}`
    transitionCount[k] = (transitionCount[k] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(transitionCount).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`)
}
main().catch(console.error)
