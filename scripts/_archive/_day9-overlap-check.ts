import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const ids = ['space_infrastructure_commercialization', 'water_infrastructure_failure', 'ai_datacenter_power_demand', 'grid_modernization_storage', 'utility_scale_battery_inflection', 'clean_energy_offtake', 'nuclear_renaissance_smr']
  for (const id of ids) {
    const { data } = await supabaseAdmin.from('theme_archetypes').select('id, name, category, is_active, typical_tickers, typical_duration_days_min, typical_duration_days_max').eq('id', id)
    if (data?.[0]) {
      const r = data[0]
      const tt = Array.isArray(r.typical_tickers) ? r.typical_tickers.join(',') : JSON.stringify(r.typical_tickers)
      console.log('\n' + id)
      console.log('  name:', r.name)
      console.log('  category:', r.category, 'active:', r.is_active, 'min/max:', r.typical_duration_days_min, '/', r.typical_duration_days_max)
      console.log('  tickers:', tt)
    } else {
      console.log('\n' + id + ': NOT FOUND')
    }
  }
  const { data: themes } = await supabaseAdmin.from('themes').select('archetype_id, name, status, event_count').in('archetype_id', ids)
  console.log('\n\n=== themes for these archetypes ===')
  for (const t of themes ?? []) console.log(`  ${t.archetype_id} · ${t.status} · ec=${t.event_count} · ${t.name}`)
}
main().catch(console.error)
