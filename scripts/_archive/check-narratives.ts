import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data, error } = await supabaseAdmin
    .from('market_narratives')
    .select('title, description, related_theme_ids, aggregate_ticker_count, top_chokepoint_tickers, rank, is_active')
    .eq('is_active', true)
    .order('rank')
  if (error) { console.error(error); return }
  data?.forEach(n => {
    console.log(`\n[Rank ${n.rank}] ${n.title}`)
    console.log(`  Desc: ${n.description}`)
    console.log(`  Themes: ${n.related_theme_ids?.length} | Tickers: ${n.aggregate_ticker_count}`)
    console.log(`  Chokepoints: ${n.top_chokepoint_tickers?.join(', ')}`)
  })
}
main().catch(console.error)
