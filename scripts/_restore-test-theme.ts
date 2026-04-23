import { config } from 'dotenv'
config({ path: '.env.local' })

const RESTORE = {
  id: 'daff2614-9594-4681-ad73-4f372d5eb6f9',
  current_cycle_stage: 'mid',
  cycle_stage_computed_at: '2026-04-23T17:45:28.394+00:00',
  previous_cycle_stage: 'mid',
  previous_cycle_stage_at: '2026-04-23T16:58:06.971+00:00',
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // restore theme fields
  const { error: upErr } = await supabaseAdmin
    .from('themes')
    .update({
      current_cycle_stage: RESTORE.current_cycle_stage,
      cycle_stage_computed_at: RESTORE.cycle_stage_computed_at,
      previous_cycle_stage: RESTORE.previous_cycle_stage,
      previous_cycle_stage_at: RESTORE.previous_cycle_stage_at,
    })
    .eq('id', RESTORE.id)
  if (upErr) throw new Error(upErr.message)
  console.log(`✓ theme restored to stage=${RESTORE.current_cycle_stage}`)

  // delete the test alerts
  const { data: del, error: delErr } = await supabaseAdmin
    .from('theme_alerts')
    .delete()
    .eq('theme_id', RESTORE.id)
    .select('id')
  if (delErr) throw new Error(delErr.message)
  console.log(`✓ deleted ${del?.length ?? 0} test alert(s)`)

  // verify
  const { data: t } = await supabaseAdmin
    .from('themes')
    .select('name, current_cycle_stage, previous_cycle_stage')
    .eq('id', RESTORE.id)
    .single()
  console.log(`verify · ${t?.name} · current=${t?.current_cycle_stage} · prev=${t?.previous_cycle_stage}`)

  const { count: alertCount } = await supabaseAdmin
    .from('theme_alerts')
    .select('id', { count: 'exact', head: true })
  console.log(`total alerts in table: ${alertCount}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
