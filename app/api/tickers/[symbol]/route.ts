import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { calcPlaybookStage } from '@/lib/time-utils'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const upper = symbol.toUpperCase()

  // Step 1: Ticker base info
  const { data: ticker, error: tickerErr } = await supabaseAdmin
    .from('tickers')
    .select('symbol, company_name, sector, logo_url')
    .eq('symbol', upper)
    .single()

  if (tickerErr || !ticker) {
    return Response.json({ error: 'Ticker not found' }, { status: 404 })
  }

  // Step 2: Active theme recommendations for this ticker
  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id, tier, exposure_direction, role_reasoning')
    .eq('ticker_symbol', upper)

  const recThemeIds = Array.from(new Set((recs ?? []).map((r) => r.theme_id)))

  // Step 3: Fetch active themes with archetype data
  const { data: themes } = recThemeIds.length > 0
    ? await supabaseAdmin
        .from('themes')
        .select('id, name, status, first_seen_at, theme_archetypes(category, typical_duration_days_min, typical_duration_days_max)')
        .in('id', recThemeIds)
        .eq('status', 'active')
    : { data: [] }

  const recByTheme: Record<string, { tier: number; exposure_direction: string; role_reasoning: string }> = {}
  for (const r of recs ?? []) recByTheme[r.theme_id] = r

  const themeResults = (themes ?? []).map((t) => {
    const arch = t.theme_archetypes as unknown as { category: string; typical_duration_days_min: number | null; typical_duration_days_max: number | null } | null
    const daysActive = Math.floor((Date.now() - new Date(t.first_seen_at).getTime()) / 86400000)
    const rec = recByTheme[t.id]
    return {
      id: t.id,
      name: t.name,
      category: arch?.category ?? 'unknown',
      exposure_direction: rec?.exposure_direction ?? 'uncertain',
      tier: rec?.tier ?? 3,
      reasoning: rec?.role_reasoning ?? '',
      days_active: daysActive,
      playbook_stage: calcPlaybookStage(
        t.first_seen_at,
        arch?.typical_duration_days_min ?? null,
        arch?.typical_duration_days_max ?? null
      ),
    }
  })

  // Step 4: Recent events from those themes
  const activeThemeIds = themeResults.map((t) => t.id)
  const { data: events } = activeThemeIds.length > 0
    ? await supabaseAdmin
        .from('events')
        .select('id, headline, source_name, event_date, trigger_theme_id')
        .in('trigger_theme_id', activeThemeIds)
        .order('event_date', { ascending: false })
        .limit(5)
    : { data: [] }

  const themeNameMap: Record<string, string> = {}
  for (const t of themeResults) themeNameMap[t.id] = t.name

  const recentEvents = (events ?? []).map((e) => ({
    id: e.id,
    headline: e.headline,
    source: e.source_name,
    event_date: e.event_date,
    theme_id: e.trigger_theme_id,
    theme_name: e.trigger_theme_id ? (themeNameMap[e.trigger_theme_id] ?? null) : null,
  }))

  return Response.json({
    ticker,
    themes: themeResults,
    recent_events: recentEvents,
  })
}
