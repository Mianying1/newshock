import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, trigger_keywords, typical_tickers, is_active, deprecated')
    .eq('id', 'ai_datacenter_power_demand')
    .single()
  console.log(JSON.stringify(data, null, 2))
}
main().catch((e) => { console.error(e); process.exit(1) })
