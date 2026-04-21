import { supabaseAdmin } from './supabase-admin'
import { calculateDaysAgo } from './theme-formatter'
import type {
  ThemeRadarItem,
  ThemeRadarSummary,
  ThemeRecommendation,
  CatalystEvent,
} from '@/types/recommendations'

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface ThemeRow {
  id: string
  name: string
  archetype_id: string | null
  status: string
  institutional_awareness: string
  theme_strength_score: number
  classification_confidence: number
  summary: string | null
  first_seen_at: string
  last_active_at: string
  event_count: number
  theme_archetypes: { category: string } | null
}

interface TickerInfo {
  company_name: string
  sector: string | null
  market_cap_usd_b: number | null
}

interface RecRow {
  ticker_symbol: string
  tier: number
  role_reasoning: string | null
  added_at: string
  tickers: TickerInfo | TickerInfo[] | null
}

interface EventRow {
  id: string
  headline: string
  source_name: string | null
  source_url: string | null
  event_date: string | null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchRecommendations(themeId: string): Promise<ThemeRecommendation[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol, tier, role_reasoning, added_at, tickers(company_name, sector, market_cap_usd_b)')
    .eq('theme_id', themeId)
    .order('tier')
    .order('ticker_symbol')

  if (error) throw new Error(`recs fetch failed: ${error.message}`)

  return (data ?? []).map((r: RecRow) => {
    const ticker = Array.isArray(r.tickers) ? r.tickers[0] : r.tickers
    return {
      ticker_symbol: r.ticker_symbol,
      company_name: ticker?.company_name ?? r.ticker_symbol,
      sector: ticker?.sector ?? '',
      market_cap_usd_b: ticker?.market_cap_usd_b ?? null,
      tier: r.tier as 1 | 2 | 3,
      role_reasoning: r.role_reasoning ?? '',
      added_at: r.added_at,
    }
  })
}

async function fetchCatalysts(themeId: string, limit = 5): Promise<CatalystEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_name, source_url, event_date')
    .eq('trigger_theme_id', themeId)
    .order('event_date', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`catalysts fetch failed: ${error.message}`)

  return (data ?? []).map((e: EventRow) => ({
    id: e.id,
    headline: e.headline,
    source_name: e.source_name ?? '',
    source_url: e.source_url ?? '',
    published_at: e.event_date ?? '',
    days_ago: e.event_date ? calculateDaysAgo(e.event_date) : 0,
  }))
}

function buildItem(row: ThemeRow, recs: ThemeRecommendation[], catalysts: CatalystEvent[]): ThemeRadarItem {
  return {
    id: row.id,
    name: row.name,
    category: row.theme_archetypes?.category ?? 'exploratory',
    archetype_id: row.archetype_id,
    is_exploratory: row.status === 'exploratory_candidate',
    status: row.status,
    institutional_awareness: row.institutional_awareness,
    theme_strength_score: row.theme_strength_score,
    classification_confidence: row.classification_confidence ?? 50,
    summary: row.summary ?? '',
    first_seen_at: row.first_seen_at,
    last_active_at: row.last_active_at,
    days_active: Math.max(1, calculateDaysAgo(row.first_seen_at)),
    event_count: row.event_count,
    recommendations: recs,
    catalysts,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function buildThemeRadar(options: {
  include_exploratory?: boolean
  awareness_filter?: string[]
  category_filter?: string[]
  limit?: number
} = {}): Promise<{ themes: ThemeRadarItem[]; summary: ThemeRadarSummary }> {
  const {
    include_exploratory = false,
    awareness_filter,
    category_filter,
    limit = 50,
  } = options

  // Build status filter
  const statusValues = include_exploratory
    ? ['active', 'exploratory_candidate']
    : ['active']

  let query = supabaseAdmin
    .from('themes')
    .select(
      'id, name, archetype_id, status, institutional_awareness, ' +
      'theme_strength_score, classification_confidence, summary, ' +
      'first_seen_at, last_active_at, event_count, ' +
      'theme_archetypes(category)'
    )
    .in('status', statusValues)
    .order('theme_strength_score', { ascending: false })
    .order('last_active_at', { ascending: false })
    .limit(limit)

  // Confidence floor
  if (include_exploratory) {
    // active >= 60, exploratory >= 40 — fetch all then filter in JS
  } else {
    query = query.gte('classification_confidence', 60)
  }

  if (awareness_filter?.length) {
    query = query.in('institutional_awareness', awareness_filter)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(`themes fetch failed: ${error.message}`)

  let themeRows = (rows ?? []) as unknown as ThemeRow[]

  // Apply confidence floor for mixed-status case
  if (include_exploratory) {
    themeRows = themeRows.filter((r) =>
      r.status === 'active'
        ? (r.classification_confidence ?? 0) >= 60
        : (r.classification_confidence ?? 0) >= 40
    )
  }

  // Apply category filter after join (archetype category)
  if (category_filter?.length) {
    themeRows = themeRows.filter((r) =>
      r.theme_archetypes?.category
        ? category_filter.includes(r.theme_archetypes.category)
        : category_filter.includes('exploratory')
    )
  }

  // Fetch recs + catalysts for each theme (in parallel)
  const items = await Promise.all(
    themeRows.map(async (row) => {
      const [recs, catalysts] = await Promise.all([
        fetchRecommendations(row.id),
        fetchCatalysts(row.id, 5),
      ])
      return buildItem(row, recs, catalysts)
    })
  )

  // Build summary
  const byCategory: Record<string, number> = {}
  const byAwareness: Record<string, number> = {}
  let totalRecs = 0
  let totalExploratory = 0
  let mostRecent = ''

  for (const item of items) {
    if (item.status === 'active') {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1
      byAwareness[item.institutional_awareness] = (byAwareness[item.institutional_awareness] ?? 0) + 1
    }
    totalRecs += item.recommendations.length
    if (item.is_exploratory) totalExploratory++
    if (!mostRecent || item.last_active_at > mostRecent) mostRecent = item.last_active_at
  }

  const summary: ThemeRadarSummary = {
    total_active: items.filter((i) => i.status === 'active').length,
    by_category: byCategory,
    by_awareness: byAwareness,
    most_recent_active: mostRecent,
    total_recommendations: totalRecs,
    total_exploratory: totalExploratory,
  }

  return { themes: items, summary }
}

export async function buildSingleTheme(themeId: string): Promise<ThemeRadarItem> {
  const { data: row, error } = await supabaseAdmin
    .from('themes')
    .select(
      'id, name, archetype_id, status, institutional_awareness, ' +
      'theme_strength_score, classification_confidence, summary, ' +
      'first_seen_at, last_active_at, event_count, ' +
      'theme_archetypes(category)'
    )
    .eq('id', themeId)
    .single()

  if (error || !row) throw new Error(`theme not found: ${themeId}`)

  const themeRow = row as unknown as ThemeRow
  const [recs, catalysts] = await Promise.all([
    fetchRecommendations(themeId),
    fetchCatalysts(themeId, 50),
  ])

  return buildItem(themeRow, recs, catalysts)
}
