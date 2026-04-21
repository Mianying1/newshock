import { supabaseAdmin } from '@/lib/supabase-admin'

interface ThemeJoin {
  id: string
  name: string
  theme_strength_score: number
  status: string
}

interface RecRow {
  ticker_symbol: string
  tier: number
  role_reasoning: string | null
  themes: ThemeJoin | ThemeJoin[]
}

interface AggTicker {
  ticker_symbol: string
  company_name: string
  sector: string | null
  market_cap_usd_b: number | null
  logo_url: string | null
  themes: {
    id: string
    name: string
    tier: number
    role_reasoning: string
    theme_strength: number
  }[]
  tier_distribution: Record<number, number>
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select(`
      ticker_symbol,
      tier,
      role_reasoning,
      themes!inner (
        id,
        name,
        theme_strength_score,
        status
      )
    `)
    .eq('themes.status', 'active')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Aggregate by ticker
  const aggregated: Record<string, AggTicker> = {}

  for (const row of (data ?? []) as unknown as RecRow[]) {
    const sym = row.ticker_symbol
    const theme = Array.isArray(row.themes) ? row.themes[0] : row.themes
    if (!theme) continue

    if (!aggregated[sym]) {
      aggregated[sym] = {
        ticker_symbol: sym,
        company_name: sym,
        sector: null,
        market_cap_usd_b: null,
        logo_url: null,
        themes: [],
        tier_distribution: { 1: 0, 2: 0, 3: 0 },
      }
    }

    aggregated[sym].themes.push({
      id: theme.id,
      name: theme.name,
      tier: row.tier,
      role_reasoning: row.role_reasoning ?? '',
      theme_strength: theme.theme_strength_score,
    })
    aggregated[sym].tier_distribution[row.tier] = (aggregated[sym].tier_distribution[row.tier] ?? 0) + 1
  }

  // Fetch ticker metadata
  const symbols = Object.keys(aggregated)
  if (symbols.length > 0) {
    const { data: tickers } = await supabaseAdmin
      .from('tickers')
      .select('symbol, company_name, sector, market_cap_usd_b, logo_url')
      .in('symbol', symbols)

    for (const t of tickers ?? []) {
      if (aggregated[t.symbol]) {
        aggregated[t.symbol].company_name = t.company_name
        aggregated[t.symbol].sector = t.sector
        aggregated[t.symbol].market_cap_usd_b = t.market_cap_usd_b
        aggregated[t.symbol].logo_url = t.logo_url ?? null
      }
    }
  }

  const result = Object.values(aggregated)
    .filter((t) => t.themes.length >= 2)
    .sort((a, b) => {
      if (b.themes.length !== a.themes.length) return b.themes.length - a.themes.length
      return (b.tier_distribution[1] ?? 0) - (a.tier_distribution[1] ?? 0)
    })

  return Response.json({ total_hot_tickers: result.length, tickers: result })
}
