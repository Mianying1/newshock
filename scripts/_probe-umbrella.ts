import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data: umbs } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, theme_strength_score, current_cycle_stage')
    .eq('theme_tier', 'umbrella')
    .order('theme_strength_score', { ascending: false })
  console.log('umbrella count:', umbs?.length)
  for (const u of umbs ?? []) {
    console.log(`  ${(u.theme_strength_score ?? 0).toString().padStart(3)} · ${u.status.padEnd(8)} · stage=${u.current_cycle_stage ?? '-'} · ${u.name}`)
  }
  const { count: subCount } = await supabaseAdmin.from('themes').select('id', { count: 'exact', head: true }).not('parent_theme_id', 'is', null)
  console.log('\nsubthemes with parent:', subCount)
}
main().catch(e => { console.error(e); process.exit(1) })
