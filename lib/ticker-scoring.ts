import { supabaseAdmin } from '@/lib/supabase-admin'
import { calcPlaybookStage } from '@/lib/time-utils'

export interface TickerScores {
  symbol: string
  company_name: string
  sector: string | null
  logo_url: string | null
  thematic_score: number
  momentum_score: number
  potential_score: number
  composite_score: number
  themes_count: number
  recent_events_7d: number
  recent_events_30d: number
  dominant_category: string | null
}

interface ThemeRow {
  id: string
  name: string
  status: string
  archetype_id: string | null
  first_seen_at: string
  days_hot: number | null
}

interface ArchetypeRow {
  id: string
  category: string | null
  typical_duration_days_min: number | null
  typical_duration_days_max: number | null
  created_at: string
}

interface RecRow {
  theme_id: string
  ticker_symbol: string
  tier: number
}

interface EventRow {
  trigger_theme_id: string | null
  event_date: string
}

interface TickerRow {
  symbol: string
  company_name: string | null
  sector: string | null
  logo_url: string | null
}

const TIER_WEIGHTS: Record<number, number> = { 1: 3, 2: 1.5, 3: 0.5 }
const RECENT_ARCHETYPE_WINDOW_DAYS = 30

export async function computeTickerScores(): Promise<TickerScores[]> {
  const [tickersRes, recsRes, themesRes, archsRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from('tickers')
      .select('symbol, company_name, sector, logo_url'),
    supabaseAdmin
      .from('theme_recommendations')
      .select('theme_id, ticker_symbol, tier'),
    supabaseAdmin
      .from('themes')
      .select('id, name, status, archetype_id, first_seen_at, days_hot')
      .in('status', ['active', 'cooling', 'exploratory_candidate']),
    supabaseAdmin
      .from('theme_archetypes')
      .select('id, category, typical_duration_days_min, typical_duration_days_max, created_at'),
    supabaseAdmin
      .from('events')
      .select('trigger_theme_id, event_date')
      .gte('event_date', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])

  const tickers = (tickersRes.data ?? []) as TickerRow[]
  const recs = (recsRes.data ?? []) as RecRow[]
  const themes = (themesRes.data ?? []) as ThemeRow[]
  const archs = (archsRes.data ?? []) as ArchetypeRow[]
  const events = (eventsRes.data ?? []) as EventRow[]

  const themeMap = new Map<string, ThemeRow>()
  for (const t of themes) themeMap.set(t.id, t)

  const archMap = new Map<string, ArchetypeRow>()
  for (const a of archs) archMap.set(a.id, a)

  // Count events per theme, last 7d and 30d
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 86400000
  const eventsByTheme7: Record<string, number> = {}
  const eventsByTheme30: Record<string, number> = {}
  for (const e of events) {
    if (!e.trigger_theme_id) continue
    const ts = new Date(e.event_date).getTime()
    eventsByTheme30[e.trigger_theme_id] = (eventsByTheme30[e.trigger_theme_id] ?? 0) + 1
    if (ts >= sevenDaysAgo) {
      eventsByTheme7[e.trigger_theme_id] = (eventsByTheme7[e.trigger_theme_id] ?? 0) + 1
    }
  }

  // Group recs by ticker, filtering to scored-eligible themes
  const recsByTicker = new Map<string, RecRow[]>()
  for (const r of recs) {
    if (!themeMap.has(r.theme_id)) continue
    const arr = recsByTicker.get(r.ticker_symbol) ?? []
    arr.push(r)
    recsByTicker.set(r.ticker_symbol, arr)
  }

  const results: TickerScores[] = []

  for (const tk of tickers) {
    const tickerRecs = recsByTicker.get(tk.symbol)
    if (!tickerRecs || tickerRecs.length === 0) continue

    let thematic = 0
    let events7 = 0
    let events30 = 0
    const activeAndCoolingThemes = new Set<string>()
    const exploratoryThemes = new Set<string>()
    const earlyStageThemes = new Set<string>()
    const recentArchetypeBonus = new Set<string>()
    const categoryFreq: Record<string, number> = {}

    for (const r of tickerRecs) {
      const theme = themeMap.get(r.theme_id)
      if (!theme) continue

      thematic += TIER_WEIGHTS[r.tier] ?? 0

      events7 += eventsByTheme7[theme.id] ?? 0
      events30 += eventsByTheme30[theme.id] ?? 0

      if (theme.status === 'active' || theme.status === 'cooling') {
        activeAndCoolingThemes.add(theme.id)
      }
      if (theme.status === 'exploratory_candidate') {
        exploratoryThemes.add(theme.id)
      }

      const arch = theme.archetype_id ? archMap.get(theme.archetype_id) : null
      if (arch?.category) {
        categoryFreq[arch.category] = (categoryFreq[arch.category] ?? 0) + 1
      }
      if (arch) {
        const archAgeDays = (now - new Date(arch.created_at).getTime()) / 86400000
        if (archAgeDays <= RECENT_ARCHETYPE_WINDOW_DAYS) {
          recentArchetypeBonus.add(theme.id)
        }
        const stage = calcPlaybookStage(
          theme.first_seen_at,
          arch.typical_duration_days_min,
          arch.typical_duration_days_max
        )
        if (stage === 'early') earlyStageThemes.add(theme.id)
      }
    }

    const momentum =
      activeAndCoolingThemes.size * 2 + events7 * 1 + events30 * 0.5

    const potential =
      exploratoryThemes.size * 2 +
      earlyStageThemes.size * 1.5 +
      recentArchetypeBonus.size * 3

    const composite = thematic * 0.4 + momentum * 0.4 + potential * 0.2

    let dominantCategory: string | null = null
    let maxFreq = 0
    for (const [cat, freq] of Object.entries(categoryFreq)) {
      if (freq > maxFreq) {
        maxFreq = freq
        dominantCategory = cat
      }
    }

    results.push({
      symbol: tk.symbol,
      company_name: tk.company_name ?? tk.symbol,
      sector: tk.sector,
      logo_url: tk.logo_url,
      thematic_score: round1(thematic),
      momentum_score: round1(momentum),
      potential_score: round1(potential),
      composite_score: round1(composite),
      themes_count: activeAndCoolingThemes.size + exploratoryThemes.size,
      recent_events_7d: events7,
      recent_events_30d: events30,
      dominant_category: dominantCategory,
    })
  }

  return results
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
