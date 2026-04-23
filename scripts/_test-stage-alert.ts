import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // Pick a theme that will compute as "mid" (we want from=early → to=mid which is warn)
  const { data: target, error: pickErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, current_cycle_stage, cycle_stage_computed_at, previous_cycle_stage, previous_cycle_stage_at')
    .eq('status', 'active')
    .eq('current_cycle_stage', 'mid')
    .limit(1)
    .single()
  if (pickErr || !target) throw new Error(`pick: ${pickErr?.message}`)
  console.log(`target: "${target.name}" (${target.id})`)
  console.log(`  before: current=${target.current_cycle_stage} · prev=${target.previous_cycle_stage}`)

  // Flip to early so next compute produces early→mid (warn)
  const { error: flipErr } = await supabaseAdmin
    .from('themes')
    .update({ current_cycle_stage: 'early' })
    .eq('id', target.id)
  if (flipErr) throw new Error(`flip: ${flipErr.message}`)
  console.log(`  flipped current_cycle_stage → early`)
  console.log(`  (original values saved · restore after test)\n`)

  // Snapshot for restore
  console.log(`RESTORE_JSON=${JSON.stringify({
    id: target.id,
    current_cycle_stage: target.current_cycle_stage,
    cycle_stage_computed_at: target.cycle_stage_computed_at,
    previous_cycle_stage: target.previous_cycle_stage,
    previous_cycle_stage_at: target.previous_cycle_stage_at,
  })}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
