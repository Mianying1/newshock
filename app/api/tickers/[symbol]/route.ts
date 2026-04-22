import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { calcPlaybookStage } from '@/lib/time-utils'
import { computeTickerScores } from '@/lib/ticker-scoring'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface ArchetypeRow {
  id: string
  category: string | null
  typical_duration_days_min: number | null
  typical_duration_days_max: number | null
  playbook: unknown
}

interface ThemeRow {
  id: string
  name: string
  name_zh: string | null
  status: string
  first_seen_at: string
  days_hot: number | null
  theme_strength_score: number | null
  archetype_id: string | null
}

interface RecRow {
  theme_id: string
  tier: number
  exposure_direction: string | null
  role_reasoning: string | null
  role_reasoning_zh: string | null
}

interface EventRow {
  id: string
  event_date: string
  headline: string
  source_name: string | null
  source_url: string | null
  trigger_theme_id: string | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const upper = symbol.toUpperCase()

  const { data: ticker } = await supabaseAdmin
    .from('tickers')
    .select('symbol, company_name, sector, logo_url')
    .eq('symbol', upper)
    .single()

  if (!ticker) {
    return Response.json({ error: 'Ticker not found' }, { status: 404 })
  }

  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id, tier, exposure_direction, role_reasoning, role_reasoning_zh')
    .eq('ticker_symbol', upper)

  const recRows = (recs ?? []) as RecRow[]
  const recThemeIds = Array.from(new Set(recRows.map((r) => r.theme_id)))

  if (recThemeIds.length === 0) {
    return Response.json({
      ticker,
      scores: null,
      themes: [],
      recent_events: [],
      exit_signals: [],
    })
  }

  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, name_zh, status, first_seen_at, days_hot, theme_strength_score, archetype_id')
    .in('id', recThemeIds)
    .in('status', ['active', 'cooling', 'exploratory_candidate'])

  const themeRows = (themes ?? []) as ThemeRow[]
  const archIds = Array.from(
    new Set(themeRows.map((t) => t.archetype_id).filter((x): x is string => Boolean(x)))
  )

  const { data: archs } = archIds.length > 0
    ? await supabaseAdmin
        .from('theme_archetypes')
        .select('id, category, typical_duration_days_min, typical_duration_days_max, playbook')
        .in('id', archIds)
    : { data: [] }

  const archMap = new Map<string, ArchetypeRow>()
  for (const a of (archs ?? []) as ArchetypeRow[]) archMap.set(a.id, a)

  const recByTheme = new Map<string, RecRow>()
  for (const r of recRows) recByTheme.set(r.theme_id, r)

  const now = Date.now()
  const themeResults = themeRows
    .map((t) => {
      const arch = t.archetype_id ? archMap.get(t.archetype_id) ?? null : null
      const rec = recByTheme.get(t.id)
      const daysActive = Math.floor((now - new Date(t.first_seen_at).getTime()) / 86400000)
      return {
        id: t.id,
        name: t.name,
        name_zh: t.name_zh ?? null,
        status: t.status,
        category: arch?.category ?? null,
        tier: rec?.tier ?? 3,
        exposure_direction: rec?.exposure_direction ?? 'uncertain',
        role_reasoning: rec?.role_reasoning ?? '',
        role_reasoning_zh: rec?.role_reasoning_zh ?? null,
        first_seen_at: t.first_seen_at,
        days_hot: t.days_hot ?? 0,
        days_active: daysActive,
        theme_strength_score: t.theme_strength_score ?? 0,
        typical_duration_days_min: arch?.typical_duration_days_min ?? null,
        typical_duration_days_max: arch?.typical_duration_days_max ?? null,
        playbook_stage: calcPlaybookStage(
          t.first_seen_at,
          arch?.typical_duration_days_min ?? null,
          arch?.typical_duration_days_max ?? null
        ),
      }
    })
    .sort((a, b) => b.theme_strength_score - a.theme_strength_score)

  const activeThemeIds = themeResults.map((t) => t.id)

  const { data: events } = activeThemeIds.length > 0
    ? await supabaseAdmin
        .from('events')
        .select('id, event_date, headline, source_name, source_url, trigger_theme_id')
        .in('trigger_theme_id', activeThemeIds)
        .order('event_date', { ascending: false })
        .limit(30)
    : { data: [] }

  const themeNameMap: Record<string, { name: string; name_zh: string | null }> = {}
  for (const t of themeResults) themeNameMap[t.id] = { name: t.name, name_zh: t.name_zh }

  const recentEvents = ((events ?? []) as EventRow[]).map((e) => {
    const match = e.trigger_theme_id ? themeNameMap[e.trigger_theme_id] ?? null : null
    return {
      id: e.id,
      headline: e.headline,
      source_name: e.source_name,
      source_url: e.source_url,
      event_date: e.event_date,
      theme_id: e.trigger_theme_id,
      theme_name: match?.name ?? null,
      theme_name_zh: match?.name_zh ?? null,
    }
  })

  const exitSignalSet = new Map<string, { signal: string; themes: string[] }>()
  for (const t of themeResults) {
    const arch = t.id ? themeRows.find((th) => th.id === t.id) : null
    const archId = arch?.archetype_id
    const archetype = archId ? archMap.get(archId) : null
    const playbook = archetype?.playbook as { exit_signals?: string[] } | undefined
    const signals = playbook?.exit_signals ?? []
    for (const s of signals) {
      const key = s.toLowerCase().trim()
      if (!exitSignalSet.has(key)) {
        exitSignalSet.set(key, { signal: s, themes: [t.name] })
      } else {
        exitSignalSet.get(key)!.themes.push(t.name)
      }
    }
  }

  const allScores = await computeTickerScores()
  const scoreRow = allScores.find((s) => s.symbol === upper) ?? null

  return Response.json({
    ticker,
    scores: scoreRow,
    themes: themeResults,
    recent_events: recentEvents,
    exit_signals: Array.from(exitSignalSet.values()),
  })
}
