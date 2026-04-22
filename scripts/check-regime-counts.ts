import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { count: sc } = await supabaseAdmin
    .from('market_regime_snapshots')
    .select('id', { count: 'exact', head: true })
  const { count: rs } = await supabaseAdmin
    .from('market_regime_series')
    .select('id', { count: 'exact', head: true })
  const indicators = ['FEDFUNDS', 'UNRATE', 'PAYEMS', 'CORE_PCE', 'CORE_CPI', 'ISM', 'WAGES', 'LEI', 'HY_OAS', 'T10Y2Y', 'VIX']
  const dist: Record<string, number> = {}
  for (const ind of indicators) {
    const { count } = await supabaseAdmin
      .from('market_regime_series')
      .select('id', { count: 'exact', head: true })
      .eq('indicator', ind)
    dist[ind] = count ?? 0
  }
  console.log('snapshots:', sc)
  console.log('series total:', rs)
  console.log('by indicator:', dist)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
