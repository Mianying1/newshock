import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const ids = [
    'defense_buildup', 'agriculture_supply_shock',
    'obesity_drug_breakthrough', 'middle_east_energy_shock',
    'rare_earth_national_security', 'turnaround_profitability_inflection',
    'ai_datacenter_power_demand',
  ]
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_tickers, deprecated, is_active, name, category')
    .in('id', ids)
  for (const id of ids) {
    const r = (data ?? []).find((x) => x.id === id)
    if (!r) { console.log(`  ✗ ${id} NOT FOUND`); continue }
    console.log(`\n${id} (${(r as { category?: string }).category}, active=${(r as { is_active?: boolean }).is_active}, deprecated=${(r as { deprecated?: boolean }).deprecated})`)
    console.log(`  name: ${(r as { name?: string }).name}`)
    console.log(`  typical_tickers: ${JSON.stringify((r as { typical_tickers?: unknown }).typical_tickers)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
