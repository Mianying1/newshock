import { config } from 'dotenv'
config({ path: '.env.local' })
async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, first_seen_at, archetype_id, theme_archetypes(typical_duration_days_min, typical_duration_days_max)')
    .in('id', (await supabaseAdmin.from('theme_recommendations').select('theme_id').eq('ticker_symbol', 'NVDA').then(r => r.data?.map(x => x.theme_id) ?? [])))
  data?.forEach(t => console.log(t.name?.slice(0,40), '| seen:', t.first_seen_at?.slice(0,10), '| arch:', JSON.stringify(t.theme_archetypes)))
}
main().catch(console.error)
