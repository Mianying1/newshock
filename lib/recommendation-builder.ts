import { supabaseAdmin } from './supabase-admin'
import { calculateDaysAgo } from './theme-formatter'
import type {
  ThemeRadarItem,
  ThemeRadarSummary,
  ThemeRecommendation,
  CatalystEvent,
  ArchetypePlaybook,
  PlaybookStage,
  ExposureDirection,
  MarketCapBand,
  ExposureType,
  ConfidenceBand,
  ThemeTier,
  ThemeChildRef,
  ThemeParentRef,
} from '@/types/recommendations'

function computePlaybookStage(daysHot: number, playbook: ArchetypePlaybook | null): PlaybookStage {
  const max = playbook?.typical_duration_days_approx?.[1] ?? 0
  if (!max || max === 0) return 'unknown'
  const pct = daysHot / max
  if (pct < 0.3) return 'early'
  if (pct < 0.7) return 'mid'
  if (pct <= 1.0) return 'late'
  return 'beyond'
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface ThemeRow {
  id: string
  name: string
  name_zh: string | null
  archetype_id: string | null
  status: string
  institutional_awareness: string
  theme_strength_score: number
  classification_confidence: number
  summary: string | null
  summary_zh: string | null
  first_seen_at: string
  last_active_at: string
  first_event_at: string | null
  days_hot: number | null
  event_count: number
  strategist_reflection: string | null
  strategist_reflection_zh: string | null
  deep_generated_at: string | null
  theme_tier: ThemeTier | null
  parent_theme_id: string | null
  theme_archetypes: {
    category: string
    playbook: ArchetypePlaybook | null
    playbook_zh: ArchetypePlaybook | null
  } | null
}

interface TickerInfo {
  company_name: string
  sector: string | null
  market_cap_usd_b: number | null
  logo_url: string | null
}

interface RecRow {
  ticker_symbol: string
  tier: number
  role_reasoning: string | null
  role_reasoning_zh: string | null
  exposure_direction: string | null
  business_exposure: string | null
  business_exposure_zh: string | null
  catalyst: string | null
  catalyst_zh: string | null
  risk: string | null
  risk_zh: string | null
  market_cap_band: string | null
  is_pure_play: boolean | null
  is_often_missed: boolean | null
  confidence: number | null
  exposure_type: string | null
  confidence_band: string | null
  is_thematic_tool: boolean | null
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
    .select(
      'ticker_symbol, tier, role_reasoning, role_reasoning_zh, exposure_direction, ' +
      'business_exposure, business_exposure_zh, catalyst, catalyst_zh, risk, risk_zh, ' +
      'market_cap_band, is_pure_play, is_often_missed, confidence, ' +
      'exposure_type, confidence_band, is_thematic_tool, added_at, ' +
      'tickers(company_name, sector, market_cap_usd_b, logo_url)'
    )
    .eq('theme_id', themeId)
    .order('tier')
    .order('ticker_symbol')

  if (error) throw new Error(`recs fetch failed: ${error.message}`)

  const validCapBands = new Set(['small', 'mid', 'large'])
  const validExposureTypes = new Set(['direct', 'observational', 'pressure'])
  const validConfBands = new Set(['high', 'medium', 'low'])

  return ((data ?? []) as unknown as RecRow[]).map((r) => {
    const ticker = Array.isArray(r.tickers) ? r.tickers[0] : r.tickers
    const validDirections = new Set(['benefits', 'headwind', 'mixed', 'uncertain'])
    const direction = validDirections.has(r.exposure_direction ?? '')
      ? (r.exposure_direction as ExposureDirection)
      : 'uncertain'
    const capBand = validCapBands.has(r.market_cap_band ?? '')
      ? (r.market_cap_band as MarketCapBand)
      : null
    const exposureType = validExposureTypes.has(r.exposure_type ?? '')
      ? (r.exposure_type as ExposureType)
      : null
    const confBand = validConfBands.has(r.confidence_band ?? '')
      ? (r.confidence_band as ConfidenceBand)
      : null
    return {
      ticker_symbol: r.ticker_symbol,
      company_name: ticker?.company_name ?? r.ticker_symbol,
      sector: ticker?.sector ?? '',
      market_cap_usd_b: ticker?.market_cap_usd_b ?? null,
      logo_url: ticker?.logo_url ?? null,
      tier: r.tier as 1 | 2 | 3,
      exposure_direction: direction,
      role_reasoning: r.role_reasoning ?? '',
      role_reasoning_zh: r.role_reasoning_zh ?? null,
      business_exposure: r.business_exposure ?? null,
      business_exposure_zh: r.business_exposure_zh ?? null,
      catalyst: r.catalyst ?? null,
      catalyst_zh: r.catalyst_zh ?? null,
      risk: r.risk ?? null,
      risk_zh: r.risk_zh ?? null,
      market_cap_band: capBand,
      is_pure_play: r.is_pure_play,
      is_often_missed: r.is_often_missed,
      confidence: r.confidence,
      exposure_type: exposureType,
      confidence_band: confBand,
      is_thematic_tool: r.is_thematic_tool,
      added_at: r.added_at,
    }
  })
}

async function fetchEarliestEventDate(themeId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('events')
    .select('event_date')
    .eq('trigger_theme_id', themeId)
    .order('event_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.event_date ?? null
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

function buildItem(
  row: ThemeRow,
  recs: ThemeRecommendation[],
  catalysts: CatalystEvent[],
  earliestEventDate: string | null,
  parent: ThemeParentRef | null = null,
  children: ThemeChildRef[] = []
): ThemeRadarItem {
  const earliest = earliestEventDate ?? row.first_seen_at
  const latest = catalysts[0]?.published_at ?? row.last_active_at

  const startDate = new Date(earliest)
  const daysActive = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000))

  // days_hot: how long the theme was actively generating events
  // frozen at (last_event - first_event); falls back to days_active for themes without backfill
  const daysHot = row.days_hot ?? daysActive

  // days_since_last_event: computed from last_active_at (always current)
  const lastEventDate = new Date(row.last_active_at)
  const daysSinceLast = Math.max(0, Math.floor((Date.now() - lastEventDate.getTime()) / 86400000))

  const archetype_playbook = row.theme_archetypes?.playbook ?? null
  const archetype_playbook_zh = row.theme_archetypes?.playbook_zh ?? null
  const playbook_stage = computePlaybookStage(daysHot, archetype_playbook)

  return {
    id: row.id,
    name: row.name,
    name_zh: row.name_zh ?? null,
    category: row.theme_archetypes?.category ?? 'exploratory',
    archetype_id: row.archetype_id,
    is_exploratory: row.status === 'exploratory_candidate',
    status: row.status,
    institutional_awareness: row.institutional_awareness,
    theme_strength_score: row.theme_strength_score,
    classification_confidence: row.classification_confidence ?? 50,
    summary: row.summary ?? '',
    summary_zh: row.summary_zh ?? null,
    first_seen_at: row.first_seen_at,
    last_active_at: row.last_active_at,
    days_active: daysActive,
    days_hot: daysHot,
    days_since_last_event: daysSinceLast,
    earliest_event_date: earliest,
    latest_event_date: latest,
    event_count: row.event_count,
    recommendations: recs,
    catalysts,
    archetype_playbook,
    archetype_playbook_zh,
    playbook_stage,
    strategist_reflection: row.strategist_reflection ?? null,
    strategist_reflection_zh: row.strategist_reflection_zh ?? null,
    deep_generated_at: row.deep_generated_at ?? null,
    theme_tier: row.theme_tier ?? null,
    parent_theme_id: row.parent_theme_id ?? null,
    parent_theme: parent,
    child_themes: children,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function buildThemeRadar(options: {
  include_exploratory?: boolean
  awareness_filter?: string[]
  category_filter?: string[]
  limit?: number
  statuses?: string[]
  tier?: ThemeTier
} = {}): Promise<{ themes: ThemeRadarItem[]; summary: ThemeRadarSummary }> {
  const {
    include_exploratory = false,
    awareness_filter,
    category_filter,
    limit = 50,
    statuses,
    tier,
  } = options

  // Build status filter
  const statusValues = statuses && statuses.length > 0
    ? statuses
    : include_exploratory
      ? ['active', 'exploratory_candidate']
      : ['active']

  let query = supabaseAdmin
    .from('themes')
    .select(
      'id, name, name_zh, archetype_id, status, institutional_awareness, ' +
      'theme_strength_score, classification_confidence, summary, summary_zh, ' +
      'first_seen_at, last_active_at, first_event_at, days_hot, event_count, ' +
      'strategist_reflection, strategist_reflection_zh, deep_generated_at, ' +
      'theme_tier, parent_theme_id, ' +
      'theme_archetypes(category, playbook, playbook_zh)'
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

  if (tier) {
    query = query.eq('theme_tier', tier)
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

  // Fetch recs + catalysts + earliest event date for each theme (in parallel)
  const items = await Promise.all(
    themeRows.map(async (row) => {
      const [recs, catalysts, earliestEventDate] = await Promise.all([
        fetchRecommendations(row.id),
        fetchCatalysts(row.id, 5),
        fetchEarliestEventDate(row.id),
      ])
      return buildItem(row, recs, catalysts, earliestEventDate)
    })
  )

  // Sort by latest_event_date DESC (most recently active first), strength as tiebreaker
  items.sort((a, b) => {
    const dateDiff = new Date(b.latest_event_date).getTime() - new Date(a.latest_event_date).getTime()
    if (dateDiff !== 0) return dateDiff
    return b.theme_strength_score - a.theme_strength_score
  })

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
      'id, name, name_zh, archetype_id, status, institutional_awareness, ' +
      'theme_strength_score, classification_confidence, summary, summary_zh, ' +
      'first_seen_at, last_active_at, first_event_at, days_hot, event_count, ' +
      'strategist_reflection, strategist_reflection_zh, deep_generated_at, ' +
      'theme_tier, parent_theme_id, ' +
      'theme_archetypes(category, playbook, playbook_zh)'
    )
    .eq('id', themeId)
    .single()

  if (error || !row) throw new Error(`theme not found: ${themeId}`)

  const themeRow = row as unknown as ThemeRow
  const [recs, catalysts, earliestEventDate, parent, children] = await Promise.all([
    fetchRecommendations(themeId),
    fetchCatalysts(themeId, 50),
    fetchEarliestEventDate(themeId),
    fetchParent(themeRow.parent_theme_id),
    fetchChildren(themeId),
  ])

  return buildItem(themeRow, recs, catalysts, earliestEventDate, parent, children)
}

async function fetchParent(parentId: string | null): Promise<ThemeParentRef | null> {
  if (!parentId) return null
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, name_zh')
    .eq('id', parentId)
    .maybeSingle()
  if (!data) return null
  return { id: data.id, name: data.name, name_zh: data.name_zh ?? null }
}

async function fetchChildren(themeId: string): Promise<ThemeChildRef[]> {
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, name_zh, theme_strength_score, event_count')
    .eq('parent_theme_id', themeId)
    .in('status', ['active', 'cooling'])
    .order('theme_strength_score', { ascending: false })
  return (data ?? []).map((r: { id: string; name: string; name_zh: string | null; theme_strength_score: number; event_count: number }) => ({
    id: r.id,
    name: r.name,
    name_zh: r.name_zh ?? null,
    theme_strength_score: r.theme_strength_score,
    event_count: r.event_count,
  }))
}
