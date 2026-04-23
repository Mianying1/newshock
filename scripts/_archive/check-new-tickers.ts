import { config } from 'dotenv'
config({ path: '.env.local' })
async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('tickers')
    .select('symbol, company_name, logo_url, created_at')
    .eq('is_recommendation_candidate', true)
    .gte('created_at', new Date(Date.now() - 2 * 3600000).toISOString())
    .order('created_at', { ascending: false })
  console.log(`New tickers (last 2h): ${data?.length ?? 0}`)
  data?.forEach(t => console.log(` ${t.symbol} | logo: ${t.logo_url ? 'yes' : 'no'}`))
}
main().catch(console.error)
