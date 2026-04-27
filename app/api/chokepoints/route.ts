import { supabaseAdmin } from '@/lib/supabase-admin'

interface ChokeEntry {
  symbol: string
  company_name: string
  logo_url: string | null
  theme_count: number
  benefits_count: number
  headwind_count: number
  mixed_count: number
}

export async function GET() {
  // Step 1: Get all active theme IDs
  const { data: activeThemes, error: themeErr } = await supabaseAdmin
    .from('themes')
    .select('id')
    .eq('status', 'active')

  if (themeErr || !activeThemes || activeThemes.length === 0) {
    return Response.json({ strong: [], weak: [], mixed: [] })
  }

  const activeThemeIds = activeThemes.map((t) => t.id)

  // Step 2: Get all recommendations for active themes with ticker info
  const { data: recs, error: recErr } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol, exposure_direction, theme_id, tickers(company_name, logo_url)')
    .in('theme_id', activeThemeIds)

  if (recErr || !recs) return Response.json({ strong: [], weak: [], mixed: [] })

  // Step 3: Aggregate per symbol
  const symbolMap: Record<
    string,
    {
      company_name: string
      logo_url: string | null
      themeIds: Set<string>
      directionCounts: Record<string, number>
    }
  > = {}

  for (const r of recs) {
    if (!symbolMap[r.ticker_symbol]) {
      const tk = (r.tickers as unknown as { company_name: string; logo_url: string | null }[] | null)?.[0] ?? null
      symbolMap[r.ticker_symbol] = {
        company_name: tk?.company_name ?? r.ticker_symbol,
        logo_url: tk?.logo_url ?? null,
        themeIds: new Set(),
        directionCounts: {},
      }
    }
    const entry = symbolMap[r.ticker_symbol]
    entry.themeIds.add(r.theme_id)
    const dir = r.exposure_direction ?? 'uncertain'
    entry.directionCounts[dir] = (entry.directionCounts[dir] ?? 0) + 1
  }

  // Step 4: Build flat list with counts, filter theme_count >= 2
  const flat: ChokeEntry[] = Object.entries(symbolMap)
    .map(([symbol, v]) => ({
      symbol,
      company_name: v.company_name,
      logo_url: v.logo_url,
      theme_count: v.themeIds.size,
      benefits_count: v.directionCounts['benefits'] ?? 0,
      headwind_count: v.directionCounts['headwind'] ?? 0,
      mixed_count: v.directionCounts['mixed'] ?? 0,
    }))
    .filter((e) => e.theme_count >= 2)
    .sort((a, b) => b.theme_count - a.theme_count)

  // Step 5: Classify into three buckets
  const strong: ChokeEntry[] = []
  const weak: ChokeEntry[] = []
  const mixed: ChokeEntry[] = []

  for (const e of flat) {
    const benefitsRatio = e.benefits_count / e.theme_count
    const headwindRatio = e.headwind_count / e.theme_count
    if (benefitsRatio >= 0.7) strong.push(e)
    else if (headwindRatio >= 0.7) weak.push(e)
    else mixed.push(e)
  }

  return Response.json(
    {
      strong: strong.slice(0, 10),
      weak: weak.slice(0, 10),
      mixed: mixed.slice(0, 10),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}
