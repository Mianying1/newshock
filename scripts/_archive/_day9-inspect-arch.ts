import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin.from('theme_archetypes').select('*').eq('id', 'ai_capex_infrastructure').limit(1)
  if (data?.[0]) console.log(JSON.stringify(data[0], null, 2))
}
main().catch(console.error)
