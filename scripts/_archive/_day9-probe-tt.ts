import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin.from('theme_archetypes').select('id, typical_tickers').limit(3)
  for (const r of data ?? []) {
    console.log(r.id, 'type=', Array.isArray(r.typical_tickers) ? 'array' : typeof r.typical_tickers)
    console.log('  value=', JSON.stringify(r.typical_tickers)?.slice(0, 400))
  }
}
main().catch(console.error)
