import { supabaseAdmin } from '@/lib/supabase-admin'
import { calcPlaybookStage } from '@/lib/time-utils'

export interface TickerScores {
  symbol: string
  company_name: string
  sector: string | null
  logo_url: string | null
  thematic_score: number
  potential_score: number
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
  last_active_at: string | null
  days_hot: number | null
}

interface ArchetypeRow {
  id: string
  category: string | null
  typical_duration_days_min: number | null
  typical_duration_days_max: number | null
  created_at: string
  playbook: unknown
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

const TIER_WEIGHTS: Record<number, number> = { 1: 3, 2: 1.5 }
const RECENT_ARCHETYPE_WINDOW_DAYS = 30
const ACTIVE_WINDOW_DAYS = 30
const LONG_TERM_MIN_DAYS = 365
const EARLY_STAGE_RATIO = 0.25
const COOLING_GRACE_DAYS = 30
const COOLING_DECAY_DAYS = 30

function coolingFactor(status: string, lastActiveAt: string | null, now: number): number {
  if (status === 'active') return 1.0
  if (status !== 'cooling') return 0
  if (!lastActiveAt) return 1.0
  const daysSinceLastEvent = (now - new Date(lastActiveAt).getTime()) / 86400000
  const daysCooling = Math.max(0, daysSinceLastEvent - COOLING_GRACE_DAYS)
  return Math.max(0, 1 - daysCooling / COOLING_DECAY_DAYS)
}

export async function computeTickerScores(): Promise<TickerScores[]> {
  const now = Date.now()
  const cutoff = new Date(now - ACTIVE_WINDOW_DAYS * 86400000).toISOString()

  const [tickersRes, recsRes, themesRes, archsRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from('tickers')
      .select('symbol, company_name, sector, logo_url'),
    supabaseAdmin
      .from('theme_recommendations')
      .select('theme_id, ticker_symbol, tier'),
    supabaseAdmin
      .from('themes')
      .select('id, name, status, archetype_id, first_seen_at, last_active_at, days_hot')
      .in('status', ['active', 'cooling'])
      .gte('last_active_at', cutoff),
    supabaseAdmin
      .from('theme_archetypes')
      .select('id, category, typical_duration_days_min, typical_duration_days_max, created_at, playbook'),
    supabaseAdmin
      .from('events')
      .select('trigger_theme_id, event_date')
      .gte('event_date', new Date(now - 30 * 86400000).toISOString()),
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
    let potential = 0
    let events7 = 0
    let events30 = 0
    const qualifyingThemes = new Set<string>()
    const categoryFreq: Record<string, number> = {}

    for (const r of tickerRecs) {
      if (r.tier !== 1 && r.tier !== 2) continue
      const theme = themeMap.get(r.theme_id)
      if (!theme) continue

      const factor = coolingFactor(theme.status, theme.last_active_at, now)
      if (factor <= 0) continue

      const tierWeight = TIER_WEIGHTS[r.tier] ?? 0
      const themeEvents7 = eventsByTheme7[theme.id] ?? 0
      const themeEvents30 = eventsByTheme30[theme.id] ?? 0
      events7 += themeEvents7
      events30 += themeEvents30
      qualifyingThemes.add(theme.id)

      const thematicBoost = 1 + Math.min(1, themeEvents7 * 0.1)
      thematic += tierWeight * factor * thematicBoost

      const arch = theme.archetype_id ? archMap.get(theme.archetype_id) ?? null : null
      if (arch?.category) {
        categoryFreq[arch.category] = (categoryFreq[arch.category] ?? 0) + 1
      }

      if (arch) {
        const pb = arch.playbook as { duration_type?: string } | null
        const durationType = pb?.duration_type ?? null
        const isLongTerm =
          durationType === 'extended' &&
          (arch.typical_duration_days_min ?? 0) >= LONG_TERM_MIN_DAYS
        if (isLongTerm) {
          const stage = calcPlaybookStage(
            theme.first_seen_at,
            arch.typical_duration_days_min,
            arch.typical_duration_days_max
          )
          const ceiling = arch.typical_duration_days_max ?? 0
          const ratio = ceiling > 0 && theme.days_hot !== null ? theme.days_hot / ceiling : 1
          const archAgeDays = (now - new Date(arch.created_at).getTime()) / 86400000
          const isNewArchetype = archAgeDays <= RECENT_ARCHETYPE_WINDOW_DAYS
          const isEarly = stage === 'early' || ratio < EARLY_STAGE_RATIO || isNewArchetype

          if (isEarly) {
            const stageMult = stage === 'early' ? 1.5 : 1.0
            potential += tierWeight * factor * stageMult + (isNewArchetype ? 2 : 0)
          }
        }
      }
    }

    if (thematic === 0 && potential === 0) continue

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
      potential_score: round1(potential),
      themes_count: qualifyingThemes.size,
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
