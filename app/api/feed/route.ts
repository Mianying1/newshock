import { supabaseAdmin } from '@/lib/supabase-admin'
import { getRelativeTime } from '@/lib/time-utils'

export async function GET() {
  // Step 1: Fetch 30 most recent events
  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_name, source_url, event_date, trigger_theme_id')
    .order('event_date', { ascending: false })
    .limit(30)

  if (error) return Response.json({ events: [] }, { status: 500 })
  if (!events || events.length === 0) return Response.json({ events: [] })

  // Step 2: Collect unique theme IDs
  const themeIds = Array.from(
    new Set(events.filter((e) => e.trigger_theme_id).map((e) => e.trigger_theme_id as string))
  )

  // Step 3: Fetch themes + categories
  const themeMap: Record<string, { id: string; name: string; category: string }> = {}
  if (themeIds.length > 0) {
    const { data: themes } = await supabaseAdmin
      .from('themes')
      .select('id, name, theme_archetypes(category)')
      .in('id', themeIds)

    for (const t of themes ?? []) {
      themeMap[t.id] = {
        id: t.id,
        name: t.name,
        category: (t.theme_archetypes as unknown as { category: string } | null)?.category ?? 'unknown',
      }
    }
  }

  // Step 4: Fetch top recommendations per theme (tier 1 first, then 2)
  const recMap: Record<string, { symbol: string; logo_url: string | null; direction: string }[]> = {}
  if (themeIds.length > 0) {
    const { data: recs } = await supabaseAdmin
      .from('theme_recommendations')
      .select('theme_id, ticker_symbol, exposure_direction, tier, tickers(logo_url)')
      .in('theme_id', themeIds)
      .order('tier', { ascending: true })

    for (const r of recs ?? []) {
      if (!recMap[r.theme_id]) recMap[r.theme_id] = []
      if (recMap[r.theme_id].length < 4) {
        recMap[r.theme_id].push({
          symbol: r.ticker_symbol,
          logo_url: ((r.tickers as unknown as { logo_url: string | null }[] | null)?.[0]?.logo_url) ?? null,
          direction: r.exposure_direction ?? 'uncertain',
        })
      }
    }
  }

  // Step 5: Assemble response
  const result = events.map((e) => {
    const theme = e.trigger_theme_id ? themeMap[e.trigger_theme_id] : null
    return {
      id: e.id,
      headline: e.headline,
      source: e.source_name,
      url: e.source_url,
      event_date: e.event_date,
      relative_time: getRelativeTime(e.event_date),
      theme: theme
        ? {
            ...theme,
            top_tickers: recMap[theme.id] ?? [],
          }
        : null,
    }
  })

  return Response.json(
    { events: result },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}
