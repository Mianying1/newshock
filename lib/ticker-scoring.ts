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

/* ============================================================
 * Top Tickers · Thematic / Potential 真实 tab 切换
 * ============================================================ */

export type ThematicWindow = '7d' | '30d'
export type PotentialStage = 'early' | 'mid' | 'all'

export async function getThematicTickers(
  windowKey: ThematicWindow,
  limit: number
): Promise<TickerScores[]> {
  const now = Date.now()
  const days = windowKey === '7d' ? 7 : 30
  const decayHalfDays = 15
  const cutoff = new Date(now - days * 86400000).toISOString()

  const [tickersRes, recsRes, themesRes, archsRes, eventsRes] = await Promise.all([
    supabaseAdmin.from('tickers').select('symbol, company_name, sector, logo_url'),
    supabaseAdmin.from('theme_recommendations').select('theme_id, ticker_symbol, tier'),
    supabaseAdmin
      .from('themes')
      .select('id, name, status, archetype_id, first_seen_at, last_active_at, days_hot')
      .in('status', ['active', 'cooling']),
    supabaseAdmin
      .from('theme_archetypes')
      .select('id, category, typical_duration_days_min, typical_duration_days_max, created_at, playbook'),
    supabaseAdmin
      .from('events')
      .select('trigger_theme_id, event_date')
      .gte('event_date', cutoff),
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

  // Aggregate event weight per theme
  const eventsByTheme: Record<string, number> = {}
  const eventsCountByTheme: Record<string, number> = {}
  for (const e of events) {
    if (!e.trigger_theme_id) continue
    const ts = new Date(e.event_date).getTime()
    const ageDays = Math.max(0, (now - ts) / 86400000)
    const weight = windowKey === '7d' ? 1 : Math.exp(-ageDays / decayHalfDays)
    eventsByTheme[e.trigger_theme_id] = (eventsByTheme[e.trigger_theme_id] ?? 0) + weight
    eventsCountByTheme[e.trigger_theme_id] = (eventsCountByTheme[e.trigger_theme_id] ?? 0) + 1
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

    let score = 0
    let eventsInWindow = 0
    const qualifyingThemes = new Set<string>()
    const categoryFreq: Record<string, number> = {}

    for (const r of tickerRecs) {
      if (r.tier !== 1 && r.tier !== 2) continue
      const theme = themeMap.get(r.theme_id)
      if (!theme) continue
      const factor = coolingFactor(theme.status, theme.last_active_at, now)
      if (factor <= 0) continue

      const tierWeight = TIER_WEIGHTS[r.tier] ?? 0
      const themeWeight = eventsByTheme[theme.id] ?? 0
      if (themeWeight === 0) continue // no activity in window

      score += tierWeight * factor * themeWeight
      eventsInWindow += eventsCountByTheme[theme.id] ?? 0
      qualifyingThemes.add(theme.id)

      const arch = theme.archetype_id ? archMap.get(theme.archetype_id) ?? null : null
      if (arch?.category) {
        categoryFreq[arch.category] = (categoryFreq[arch.category] ?? 0) + 1
      }
    }

    if (score === 0) continue

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
      thematic_score: round1(Math.min(9.9, score / 10)),
      potential_score: 0,
      themes_count: qualifyingThemes.size,
      recent_events_7d: windowKey === '7d' ? eventsInWindow : 0,
      recent_events_30d: windowKey === '30d' ? eventsInWindow : 0,
      dominant_category: dominantCategory,
    })
  }

  results.sort((a, b) => b.thematic_score - a.thematic_score)
  return results.slice(0, limit)
}

export async function getPotentialTickers(
  stage: PotentialStage,
  limit: number
): Promise<TickerScores[]> {
  const now = Date.now()

  const [tickersRes, recsRes, themesRes, archsRes] = await Promise.all([
    supabaseAdmin.from('tickers').select('symbol, company_name, sector, logo_url'),
    supabaseAdmin.from('theme_recommendations').select('theme_id, ticker_symbol, tier'),
    supabaseAdmin
      .from('themes')
      .select('id, name, status, archetype_id, first_seen_at, last_active_at, days_hot, theme_strength_score')
      .in('status', ['active', 'cooling']),
    supabaseAdmin
      .from('theme_archetypes')
      .select('id, category, typical_duration_days_min, typical_duration_days_max, created_at, playbook'),
  ])

  const tickers = (tickersRes.data ?? []) as TickerRow[]
  const recs = (recsRes.data ?? []) as RecRow[]
  const themes = (themesRes.data ?? []) as (ThemeRow & { theme_strength_score: number | null })[]
  const archs = (archsRes.data ?? []) as ArchetypeRow[]

  const archMap = new Map<string, ArchetypeRow>()
  for (const a of archs) archMap.set(a.id, a)

  // Qualify long-horizon themes + compute stage ratio
  const eligibleThemes = new Map<
    string,
    { theme: typeof themes[number]; ratio: number; category: string | null; strength: number }
  >()
  for (const th of themes) {
    const arch = th.archetype_id ? archMap.get(th.archetype_id) ?? null : null
    if (!arch) continue
    const pb = arch.playbook as { duration_type?: string } | null
    const durationType = pb?.duration_type ?? null
    const minDays = arch.typical_duration_days_min ?? 0
    const maxDays = arch.typical_duration_days_max ?? 0
    const isLongHorizon = durationType === 'extended' && minDays >= LONG_TERM_MIN_DAYS
    if (!isLongHorizon) continue
    if (maxDays <= 0) continue

    const daysHot = th.days_hot ?? 0
    const ratio = maxDays > 0 ? daysHot / maxDays : 1

    if (stage === 'early' && ratio >= 0.3) continue
    if (stage === 'mid' && (ratio < 0.3 || ratio > 0.7)) continue
    // stage === 'all' → no filter

    const factor = coolingFactor(th.status, th.last_active_at, now)
    if (factor <= 0) continue

    eligibleThemes.set(th.id, {
      theme: th,
      ratio,
      category: arch.category ?? null,
      strength: th.theme_strength_score ?? 0,
    })
  }

  const recsByTicker = new Map<string, RecRow[]>()
  for (const r of recs) {
    if (!eligibleThemes.has(r.theme_id)) continue
    const arr = recsByTicker.get(r.ticker_symbol) ?? []
    arr.push(r)
    recsByTicker.set(r.ticker_symbol, arr)
  }

  const results: TickerScores[] = []
  for (const tk of tickers) {
    const tickerRecs = recsByTicker.get(tk.symbol)
    if (!tickerRecs || tickerRecs.length === 0) continue

    let score = 0
    const qualifyingThemes = new Set<string>()
    const categoryFreq: Record<string, number> = {}

    for (const r of tickerRecs) {
      if (r.tier !== 1 && r.tier !== 2) continue
      const entry = eligibleThemes.get(r.theme_id)
      if (!entry) continue
      const tierWeight = TIER_WEIGHTS[r.tier] ?? 0
      // Early themes get a boost — they are the whole point of this list
      const stageMult = entry.ratio < 0.3 ? 1.5 : entry.ratio <= 0.7 ? 1.0 : 0.7
      const strength = entry.strength > 0 ? entry.strength / 10 : 1
      score += tierWeight * stageMult * strength
      qualifyingThemes.add(r.theme_id)
      if (entry.category) {
        categoryFreq[entry.category] = (categoryFreq[entry.category] ?? 0) + 1
      }
    }

    if (score === 0) continue

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
      thematic_score: 0,
      potential_score: round1(Math.min(9.9, score / 10)),
      themes_count: qualifyingThemes.size,
      recent_events_7d: 0,
      recent_events_30d: 0,
      dominant_category: dominantCategory,
    })
  }

  results.sort((a, b) => b.potential_score - a.potential_score)
  return results.slice(0, limit)
}

// =============================================================================
// UX-1 · Long/Short per-(theme, ticker) rows
// =============================================================================

export type LongShortMode = 'long' | 'short'

export interface LongShortTickerRow {
  symbol: string
  company_name: string | null
  sector: string | null
  logo_url: string | null
  ticker_maturity_score: number | null
  ticker_type: string | null                // core_hold / short_catalyst / watch
  theme_id: string
  theme_name: string
  theme_strength_score: number | null
  dominant_sentiment: string | null         // bullish / mixed / bearish / neutral
  sentiment_score: number | null
  duration_type: string | null              // extended / dependent / bounded
  category: string | null
}

export async function getLongShortTickers(
  mode: LongShortMode,
  limit = 200
): Promise<LongShortTickerRow[]> {
  const wantedTickerTypes = mode === 'long' ? ['core_hold', 'watch'] : ['short_catalyst']
  const wantedDurationTypes = mode === 'long' ? ['extended', 'dependent'] : ['bounded']

  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select(`
      ticker_symbol,
      ticker_maturity_score,
      ticker_type,
      theme_id,
      themes!inner (
        id,
        name,
        status,
        theme_strength_score,
        dominant_sentiment,
        sentiment_score,
        archetype_id,
        theme_archetypes!inner (
          id,
          category,
          duration_type
        )
      ),
      tickers!inner (
        symbol,
        company_name,
        sector,
        logo_url
      )
    `)
    .in('ticker_type', wantedTickerTypes)
    .not('ticker_maturity_score', 'is', null)
    .order('ticker_maturity_score', { ascending: false })
    .limit(500)

  if (error) throw new Error(`getLongShortTickers: ${error.message}`)

  type Row = {
    ticker_symbol: string
    ticker_maturity_score: number | null
    ticker_type: string | null
    theme_id: string
    themes: {
      id: string
      name: string
      status: string
      theme_strength_score: number | null
      dominant_sentiment: string | null
      sentiment_score: number | null
      theme_archetypes: {
        id: string
        category: string | null
        duration_type: string | null
      } | null
    } | null
    tickers: {
      symbol: string
      company_name: string | null
      sector: string | null
      logo_url: string | null
    } | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const filtered = rows
    .filter((r) => r.themes?.status === 'active')
    .filter((r) => {
      const dt = r.themes?.theme_archetypes?.duration_type ?? null
      return dt && wantedDurationTypes.includes(dt)
    })
    .map((r): LongShortTickerRow => ({
      symbol: r.ticker_symbol,
      company_name: r.tickers?.company_name ?? null,
      sector: r.tickers?.sector ?? null,
      logo_url: r.tickers?.logo_url ?? null,
      ticker_maturity_score: r.ticker_maturity_score,
      ticker_type: r.ticker_type,
      theme_id: r.theme_id,
      theme_name: r.themes?.name ?? '',
      theme_strength_score: r.themes?.theme_strength_score ?? null,
      dominant_sentiment: r.themes?.dominant_sentiment ?? null,
      sentiment_score: r.themes?.sentiment_score ?? null,
      duration_type: r.themes?.theme_archetypes?.duration_type ?? null,
      category: r.themes?.theme_archetypes?.category ?? null,
    }))

  // Dedup by ticker_symbol — keep the row with the highest ticker_maturity_score.
  // Filtered is already sorted DESC on maturity_score, so first occurrence wins.
  const seen = new Set<string>()
  const deduped: LongShortTickerRow[] = []
  for (const r of filtered) {
    if (seen.has(r.symbol)) continue
    seen.add(r.symbol)
    deduped.push(r)
  }

  return deduped.slice(0, limit)
}

// =============================================================================
// UX-1 · Long-horizon angle directions (per-ticker rows)
//
// Approved new-angle candidates get expanded into one row per (ticker, umbrella).
// Filters applied:
//   1. umbrella duration_type ∈ {extended, dependent}  — no bounded cycles
//   2. umbrella theme_strength_score >= 70             — only strong main lines
//   3. (ticker, umbrella-family) has an event in last 14 days — freshness
//   4. per-umbrella cap of 3 tickers                   — cross-umbrella spread
// =============================================================================

export interface AngleDirectionRow {
  candidate_id: string
  ticker_symbol: string
  umbrella_theme_id: string
  umbrella_name: string
  angle_label: string
  confidence: number | null
  is_ai_pending: boolean
  last_event_days_ago: number
}

export async function getApprovedNewAngles(limit = 50): Promise<AngleDirectionRow[]> {
  const now = Date.now()

  // Step 1 — fetch approved candidates joined to umbrella theme + archetype
  const { data: candidatesData, error: candErr } = await supabaseAdmin
    .from('new_angle_candidates')
    .select(`
      id,
      angle_label,
      proposed_tickers,
      confidence,
      reviewed_at,
      umbrella_theme_id,
      themes!inner (
        id,
        name,
        theme_strength_score,
        theme_archetypes!inner (
          duration_type
        )
      )
    `)
    .eq('status', 'approved')
    .order('confidence', { ascending: false })
    .limit(500)

  if (candErr) throw new Error(`getApprovedNewAngles: ${candErr.message}`)

  type CandidateRow = {
    id: string
    angle_label: string
    proposed_tickers: string[] | null
    confidence: number | null
    reviewed_at: string | null
    umbrella_theme_id: string
    themes: {
      id: string
      name: string
      theme_strength_score: number | null
      theme_archetypes: { duration_type: string | null } | null
    } | null
  }

  const candidates = ((candidatesData ?? []) as unknown as CandidateRow[]).filter((c) => {
    const strength = c.themes?.theme_strength_score ?? 0
    const dt = c.themes?.theme_archetypes?.duration_type ?? null
    return strength >= 70 && (dt === 'extended' || dt === 'dependent')
  })

  if (candidates.length === 0) return []

  // Step 2 — collect allowed theme ids per umbrella: umbrella + subthemes
  const umbrellaIdSet = new Set<string>()
  for (const c of candidates) umbrellaIdSet.add(c.umbrella_theme_id)
  const umbrellaIds = Array.from(umbrellaIdSet)

  const { data: subthemesData } = await supabaseAdmin
    .from('themes')
    .select('id, parent_theme_id')
    .in('parent_theme_id', umbrellaIds)

  const themeToUmbrella = new Map<string, string>()
  for (const u of umbrellaIds) themeToUmbrella.set(u, u)
  for (const s of (subthemesData ?? []) as { id: string; parent_theme_id: string | null }[]) {
    if (!s.parent_theme_id) continue
    if (!themeToUmbrella.has(s.parent_theme_id)) continue
    themeToUmbrella.set(s.id, s.parent_theme_id)
  }

  // Step 3 — fetch events in last 14 days touching any allowed theme
  //
  // Freshness is computed at umbrella-family level: if the umbrella (or any of
  // its subthemes) had an event in 14d, every proposed ticker on that umbrella
  // qualifies. `events.mentioned_tickers` is too sparse in practice to filter
  // per (ticker, umbrella); umbrella-level activity is the usable signal.
  const cutoff = new Date(now - 14 * 86400000).toISOString()
  const allThemeIds = Array.from(themeToUmbrella.keys())
  const { data: eventsData } = await supabaseAdmin
    .from('events')
    .select('trigger_theme_id, event_date')
    .gte('event_date', cutoff)
    .in('trigger_theme_id', allThemeIds)

  const umbrellaLatestTs = new Map<string, number>()
  for (const e of (eventsData ?? []) as {
    trigger_theme_id: string | null
    event_date: string
  }[]) {
    if (!e.trigger_theme_id) continue
    const umbrella = themeToUmbrella.get(e.trigger_theme_id)
    if (!umbrella) continue
    const ts = new Date(e.event_date).getTime()
    const cur = umbrellaLatestTs.get(umbrella)
    if (cur === undefined || ts > cur) umbrellaLatestTs.set(umbrella, ts)
  }

  // Step 4-6 — fan out proposed_tickers, require umbrella to have 14d event,
  // dedup (ticker, umbrella) by max confidence
  type Triplet = AngleDirectionRow & { pairKey: string }
  const byPair = new Map<string, Triplet>()

  for (const c of candidates) {
    const umbrellaId = c.umbrella_theme_id
    const umbrellaTs = umbrellaLatestTs.get(umbrellaId)
    if (umbrellaTs === undefined) continue // Filter 3: umbrella has no event in 14d
    const daysAgo = Math.max(0, Math.floor((now - umbrellaTs) / 86400000))
    const umbrellaName = c.themes?.name ?? ''
    for (const tk of c.proposed_tickers ?? []) {
      const pairKey = `${tk}|${umbrellaId}`
      const existing = byPair.get(pairKey)
      const conf = c.confidence ?? 0
      if (existing && (existing.confidence ?? 0) >= conf) continue
      byPair.set(pairKey, {
        pairKey,
        candidate_id: c.id,
        ticker_symbol: tk,
        umbrella_theme_id: umbrellaId,
        umbrella_name: umbrellaName,
        angle_label: c.angle_label,
        confidence: c.confidence,
        is_ai_pending: c.reviewed_at === null,
        last_event_days_ago: daysAgo,
      })
    }
  }

  // Step 7 — per-umbrella cap of 3, global sort by confidence DESC
  const sorted = Array.from(byPair.values()).sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
  )

  const perUmbrella = new Map<string, number>()
  const results: AngleDirectionRow[] = []
  for (const t of sorted) {
    const cnt = perUmbrella.get(t.umbrella_theme_id) ?? 0
    if (cnt >= 3) continue
    perUmbrella.set(t.umbrella_theme_id, cnt + 1)
    const { pairKey: _pk, ...row } = t
    results.push(row)
    if (results.length >= limit) break
  }

  return results
}

