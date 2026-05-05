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
  ConvictionBreakdown,
  CounterEvidenceSummary,
  RecentDriver,
  DriverIcon,
  EmergingCandidate,
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
  conviction_score: number | null
  conviction_breakdown: ConvictionBreakdown | null
  conviction_reasoning: string | null
  conviction_reasoning_zh: string | null
  conviction_generated_at: string | null
  counter_evidence_summary: unknown
  recent_drivers: unknown
  recent_drivers_generated_at: string | null
  specific_playbook: ArchetypePlaybook | null
  specific_playbook_zh: ArchetypePlaybook | null
  theme_archetypes: {
    category: string
    playbook: ArchetypePlaybook | null
    playbook_zh: ArchetypePlaybook | null
    typical_duration_days_max: number | null
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
  exposure_pct: number | null
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
  context_label: string | null
  added_at: string
  long_score: number | null
  short_score: number | null
  potential_score: number | null
  tickers: TickerInfo | TickerInfo[] | null
}

interface EventRow {
  id: string
  headline: string
  short_headline: string | null
  short_headline_zh: string | null
  source_name: string | null
  source_url: string | null
  event_date: string | null
  supports_or_contradicts: string | null
  counter_evidence_reasoning: string | null
  counter_evidence_reasoning_zh: string | null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function shapeRec(r: RecRow): ThemeRecommendation {
  const validCapBands = new Set(['small', 'mid', 'large'])
  const validExposureTypes = new Set(['direct', 'observational', 'pressure', 'mixed'])
  const validConfBands = new Set(['high', 'medium', 'low'])
  const validDirections = new Set(['benefits', 'headwind', 'mixed', 'uncertain'])
  const ticker = Array.isArray(r.tickers) ? r.tickers[0] : r.tickers
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
    exposure_pct: r.exposure_pct,
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
    context_label: r.context_label ?? null,
    added_at: r.added_at,
    long_score: r.long_score,
    short_score: r.short_score,
    potential_score: r.potential_score,
  }
}

const REC_SELECT =
  'ticker_symbol, tier, role_reasoning, role_reasoning_zh, exposure_direction, exposure_pct, ' +
  'business_exposure, business_exposure_zh, catalyst, catalyst_zh, risk, risk_zh, ' +
  'market_cap_band, is_pure_play, is_often_missed, confidence, ' +
  'exposure_type, confidence_band, is_thematic_tool, context_label, added_at, ' +
  'long_score, short_score, potential_score, ' +
  'tickers(company_name, sector, market_cap_usd_b, logo_url)'

async function fetchRecommendations(themeId: string): Promise<ThemeRecommendation[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select(REC_SELECT)
    .eq('theme_id', themeId)
    // Hide LLM-flagged low-confidence picks. NULLs (pre-enrichment) stay visible.
    .or('confidence_band.is.null,confidence_band.neq.low')
    .order('tier')
    .order('ticker_symbol')

  if (error) throw new Error(`recs fetch failed: ${error.message}`)
  return ((data ?? []) as unknown as RecRow[]).map(shapeRec)
}

async function fetchRecommendationsBatch(themeIds: string[]): Promise<Map<string, ThemeRecommendation[]>> {
  const out = new Map<string, ThemeRecommendation[]>()
  if (themeIds.length === 0) return out
  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select(`theme_id, ${REC_SELECT}`)
    .in('theme_id', themeIds)
    .or('confidence_band.is.null,confidence_band.neq.low')
    .order('tier')
    .order('ticker_symbol')
  if (error) throw new Error(`recs batch fetch failed: ${error.message}`)
  for (const row of (data ?? []) as unknown as Array<RecRow & { theme_id: string }>) {
    let arr = out.get(row.theme_id)
    if (!arr) { arr = []; out.set(row.theme_id, arr) }
    arr.push(shapeRec(row))
  }
  return out
}

async function fetchEmergingCandidates(
  themeId: string,
  parentThemeId: string | null,
): Promise<EmergingCandidate[]> {
  try {
    const ids = parentThemeId ? [themeId, parentThemeId] : [themeId]
    const { data, error } = await supabaseAdmin
      .from('new_angle_candidates')
      .select('id, umbrella_theme_id, angle_label, gap_reasoning, confidence, proposed_tickers, status')
      .in('umbrella_theme_id', ids)
      .order('confidence', { ascending: false, nullsFirst: false })
      .limit(20)
    if (error || !data) return []

    type CandidateRow = {
      id: string
      umbrella_theme_id: string
      angle_label: string
      gap_reasoning: string | null
      confidence: number | null
      proposed_tickers: string[] | null
      status: string | null
    }
    const rows = data as unknown as CandidateRow[]

    const tickerSymbols = Array.from(
      new Set(
        rows
          .flatMap((r) => r.proposed_tickers ?? [])
          .filter((s): s is string => typeof s === 'string' && s.length > 0),
      ),
    )

    const companyByTicker = new Map<string, string | null>()
    if (tickerSymbols.length > 0) {
      const { data: tk } = await supabaseAdmin
        .from('tickers')
        .select('symbol, company_name')
        .in('symbol', tickerSymbols)
      for (const row of (tk ?? []) as Array<{ symbol: string; company_name: string | null }>) {
        companyByTicker.set(row.symbol, row.company_name)
      }
    }

    const scoreByPair = new Map<string, number>()
    if (tickerSymbols.length > 0) {
      const { data: scores } = await supabaseAdmin
        .from('theme_recommendations')
        .select('theme_id, ticker_symbol, potential_score')
        .in('theme_id', ids)
        .in('ticker_symbol', tickerSymbols)
      for (const row of (scores ?? []) as Array<{ theme_id: string; ticker_symbol: string; potential_score: number | null }>) {
        if (row.potential_score == null) continue
        const key = `${row.theme_id}|${row.ticker_symbol}`
        scoreByPair.set(key, row.potential_score)
      }
    }

    const out: EmergingCandidate[] = []
    for (const r of rows) {
      const firstTicker = (r.proposed_tickers ?? []).find((s) => typeof s === 'string' && s.length > 0)
      if (!firstTicker) continue
      const score =
        scoreByPair.get(`${r.umbrella_theme_id}|${firstTicker}`) ??
        (parentThemeId ? scoreByPair.get(`${parentThemeId}|${firstTicker}`) : undefined) ??
        scoreByPair.get(`${themeId}|${firstTicker}`) ??
        null
      out.push({
        id: r.id,
        ticker_symbol: firstTicker,
        company_name: companyByTicker.get(firstTicker) ?? null,
        angle_label: r.angle_label,
        gap_reasoning: r.gap_reasoning,
        confidence: r.confidence,
        emerging_score: score == null ? null : Math.round(score),
      })
      if (out.length >= 5) break
    }
    return out
  } catch {
    return []
  }
}

async function fetchRecentDrivers(
  themeId: string,
): Promise<{ recent_drivers: unknown; recent_drivers_generated_at: string | null }> {
  // Tolerant: the migration adding these columns may not be applied yet.
  try {
    const { data, error } = await supabaseAdmin
      .from('themes')
      .select('recent_drivers, recent_drivers_generated_at')
      .eq('id', themeId)
      .maybeSingle()
    if (error || !data) return { recent_drivers: null, recent_drivers_generated_at: null }
    const r = data as { recent_drivers?: unknown; recent_drivers_generated_at?: string | null }
    return {
      recent_drivers: r.recent_drivers ?? null,
      recent_drivers_generated_at: r.recent_drivers_generated_at ?? null,
    }
  } catch {
    return { recent_drivers: null, recent_drivers_generated_at: null }
  }
}

async function fetchExitSignalTriggers(themeId: string) {
  // Tolerant: table is created by migration 20260425000003.
  try {
    const { data, error } = await supabaseAdmin
      .from('theme_exit_signal_triggers')
      .select('signal_index, signal_text, trigger_rule_type, trigger_status, triggered_at, triggered_evidence, last_checked_at')
      .eq('theme_id', themeId)
      .order('signal_index', { ascending: true })
    if (error || !data) return null
    return data as unknown as import('@/types/recommendations').ExitSignalTrigger[]
  } catch {
    return null
  }
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

async function fetchEarliestEventDatesBatch(themeIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (themeIds.length === 0) return out
  for (const id of themeIds) out.set(id, null)
  const { data } = await supabaseAdmin
    .from('events')
    .select('trigger_theme_id, event_date')
    .in('trigger_theme_id', themeIds)
    .not('event_date', 'is', null)
    .order('event_date', { ascending: true })
  for (const row of (data ?? []) as Array<{ trigger_theme_id: string; event_date: string | null }>) {
    if (!row.trigger_theme_id) continue
    if (out.get(row.trigger_theme_id) == null) {
      out.set(row.trigger_theme_id, row.event_date ?? null)
    }
  }
  return out
}

function shapeCatalyst(e: EventRow): CatalystEvent {
  const validDirections = new Set(['supports', 'contradicts', 'neutral'])
  return {
    id: e.id,
    headline: e.headline,
    short_headline: e.short_headline,
    short_headline_zh: e.short_headline_zh,
    source_name: e.source_name ?? '',
    source_url: e.source_url ?? '',
    published_at: e.event_date ?? '',
    days_ago: e.event_date ? calculateDaysAgo(e.event_date) : 0,
    supports_or_contradicts: validDirections.has(e.supports_or_contradicts ?? '')
      ? (e.supports_or_contradicts as 'supports' | 'contradicts' | 'neutral')
      : null,
    counter_evidence_reasoning: e.counter_evidence_reasoning,
    counter_evidence_reasoning_zh: e.counter_evidence_reasoning_zh,
  }
}

const CATALYST_SELECT =
  'id, headline, short_headline, short_headline_zh, source_name, source_url, ' +
  'event_date, supports_or_contradicts, counter_evidence_reasoning, counter_evidence_reasoning_zh'

async function fetchCatalysts(themeId: string, limit = 5): Promise<CatalystEvent[]> {
  // Hide stale events from the theme catalyst stream — events older than 90 days
  // lose the "today's narrative" framing the section is meant to convey.
  // DB rows preserved; UI hide only.
  const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('events')
    .select(CATALYST_SELECT)
    .eq('trigger_theme_id', themeId)
    .gte('event_date', cutoff)
    .order('event_date', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`catalysts fetch failed: ${error.message}`)
  return ((data ?? []) as unknown as EventRow[]).map(shapeCatalyst)
}

async function fetchCatalystsBatch(themeIds: string[], perThemeLimit = 5): Promise<Map<string, CatalystEvent[]>> {
  const out = new Map<string, CatalystEvent[]>()
  if (themeIds.length === 0) return out
  const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('events')
    .select(`trigger_theme_id, ${CATALYST_SELECT}`)
    .in('trigger_theme_id', themeIds)
    .gte('event_date', cutoff)
    .order('event_date', { ascending: false })
  if (error) throw new Error(`catalysts batch fetch failed: ${error.message}`)
  for (const row of (data ?? []) as Array<EventRow & { trigger_theme_id: string }>) {
    let arr = out.get(row.trigger_theme_id)
    if (!arr) { arr = []; out.set(row.trigger_theme_id, arr) }
    if (arr.length < perThemeLimit) arr.push(shapeCatalyst(row))
  }
  return out
}

function buildItem(
  row: ThemeRow,
  recs: ThemeRecommendation[],
  catalysts: CatalystEvent[],
  earliestEventDate: string | null,
  parent: ThemeParentRef | null = null,
  children: ThemeChildRef[] = [],
  emergingCandidates: EmergingCandidate[] = [],
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

  // Theme-specific playbook overrides the archetype baseline when present.
  // CJK-aware routing: legacy data wrote zh content into the en column on both
  // themes.specific_playbook and theme_archetypes.playbook, so we detect
  // language and route accordingly to keep EN view from leaking zh.
  // Sampled-field check: only inspect the prose the user actually reads as a
  // sentence (observation + first case name + first exit_trigger). Numeric
  // strings like `approximate_duration: "约 12-18 个月"` are minor and don't
  // count, so a partially-translated playbook still counts as EN.
  const isCJK = (pb: unknown) => {
    if (!pb || typeof pb !== 'object') return false
    const p = pb as { historical_cases?: Array<{ name?: string; exit_trigger?: string }>; this_time_different?: { observation?: string } }
    const sample = [
      p.this_time_different?.observation ?? '',
      p.historical_cases?.[0]?.name ?? '',
      p.historical_cases?.[0]?.exit_trigger ?? '',
    ].join(' ')
    return /[\u4e00-\u9fff]/.test(sample)
  }
  const sp = row.specific_playbook
  const spZh = row.specific_playbook_zh
  const ap = row.theme_archetypes?.playbook ?? null
  const apZh = row.theme_archetypes?.playbook_zh ?? null

  const archetype_playbook = (() => {
    if (sp && !isCJK(sp)) return sp
    if (ap && !isCJK(ap)) return ap
    return null
  })()
  const archetype_playbook_zh = (() => {
    if (spZh) return spZh
    if (sp && isCJK(sp)) return sp
    if (apZh) return apZh
    if (ap && isCJK(ap)) return ap
    return null
  })()
  const playbook_source: 'theme' | 'archetype' =
    sp || spZh ? 'theme' : 'archetype'
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
    playbook_source,
    playbook_stage,
    strategist_reflection: row.strategist_reflection ?? null,
    strategist_reflection_zh: row.strategist_reflection_zh ?? null,
    deep_generated_at: row.deep_generated_at ?? null,
    theme_tier: row.theme_tier ?? null,
    parent_theme_id: row.parent_theme_id ?? null,
    parent_theme: parent,
    child_themes: children,
    conviction_score: row.conviction_score ?? null,
    conviction_breakdown: row.conviction_breakdown ?? null,
    conviction_reasoning: row.conviction_reasoning ?? null,
    conviction_reasoning_zh: row.conviction_reasoning_zh ?? null,
    conviction_generated_at: row.conviction_generated_at ?? null,
    counter_evidence_summary: parseCounterSummary(row.counter_evidence_summary),
    recent_drivers: parseRecentDrivers(row.recent_drivers),
    recent_drivers_generated_at: row.recent_drivers_generated_at ?? null,
    exit_signal_triggers: null,
    typical_duration_days_max: row.theme_archetypes?.typical_duration_days_max ?? null,
    emerging_candidates: emergingCandidates,
  }
}

const VALID_DRIVER_ICONS: ReadonlySet<DriverIcon> = new Set([
  'bolt', 'building', 'chip', 'globe', 'chart', 'factory', 'shield',
])

function parseRecentDrivers(raw: unknown): RecentDriver[] | null {
  if (!Array.isArray(raw)) return null
  const out: RecentDriver[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const icon = typeof r.icon === 'string' && VALID_DRIVER_ICONS.has(r.icon as DriverIcon)
      ? (r.icon as DriverIcon)
      : 'chart'
    const title = typeof r.title === 'string' ? r.title : ''
    if (!title) continue
    out.push({
      icon,
      title,
      title_zh: typeof r.title_zh === 'string' ? r.title_zh : title,
      description: typeof r.description === 'string' ? r.description : '',
      description_zh: typeof r.description_zh === 'string' ? r.description_zh : '',
      source_label: typeof r.source_label === 'string' ? r.source_label : '',
      source_url: typeof r.source_url === 'string' ? r.source_url : null,
    })
  }
  return out.length ? out : null
}

function parseCounterSummary(raw: unknown): CounterEvidenceSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const s = typeof r.supports_count === 'number' ? r.supports_count : null
  const c = typeof r.contradicts_count === 'number' ? r.contradicts_count : null
  const n = typeof r.neutral_count === 'number' ? r.neutral_count : null
  const lu = typeof r.last_updated === 'string' ? r.last_updated : null
  if (s === null || c === null || n === null || lu === null) return null
  return { supports_count: s, contradicts_count: c, neutral_count: n, last_updated: lu }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function buildThemeRadar(options: {
  include_exploratory?: boolean
  awareness_filter?: string[]
  category_filter?: string[]
  limit?: number
  statuses?: string[]
  tier?: ThemeTier
  include_children?: boolean
  theme_ids?: string[]
} = {}): Promise<{ themes: ThemeRadarItem[]; summary: ThemeRadarSummary }> {
  const {
    include_exploratory = false,
    awareness_filter,
    category_filter,
    limit = 50,
    statuses,
    tier,
    include_children = false,
    theme_ids,
  } = options

  // ID-list mode bypasses status/confidence/awareness/tier filters — caller
  // already knows which themes it wants (e.g. embedding rich child_themes
  // on a parent detail response).
  const idMode = Array.isArray(theme_ids) && theme_ids.length > 0

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
      'conviction_score, conviction_breakdown, conviction_reasoning, conviction_reasoning_zh, conviction_generated_at, counter_evidence_summary, ' +
      'specific_playbook, specific_playbook_zh, ' +
      'theme_archetypes(category, playbook, playbook_zh, typical_duration_days_max)'
    )
    .order('theme_strength_score', { ascending: false })
    .order('last_active_at', { ascending: false })
    .limit(idMode ? theme_ids.length : limit)

  if (idMode) {
    query = query.in('id', theme_ids)
  } else {
    query = query.in('status', statusValues)
    if (!include_exploratory) {
      query = query.gte('classification_confidence', 60)
    }
    if (awareness_filter?.length) {
      query = query.in('institutional_awareness', awareness_filter)
    }
    if (tier) {
      query = query.eq('theme_tier', tier)
    }
  }

  const { data: rows, error } = await query
  if (error) throw new Error(`themes fetch failed: ${error.message}`)

  let themeRows = (rows ?? []) as unknown as ThemeRow[]

  if (!idMode) {
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
  }

  // Batch fan-out: 4 queries with `IN (themeIds)` instead of N×4 per-theme fetches.
  // Reduces ~121 queries (30 themes × 4 + 1) → 5 queries (1 themes + 4 batch).
  const themeIds = themeRows.map((r) => r.id)
  const [recsByTheme, catalystsByTheme, earliestByTheme, childrenByParent] = await Promise.all([
    fetchRecommendationsBatch(themeIds),
    fetchCatalystsBatch(themeIds, 5),
    fetchEarliestEventDatesBatch(themeIds),
    include_children ? fetchChildrenBatch(themeIds) : Promise.resolve(new Map<string, ThemeChildRef[]>()),
  ])

  const items = themeRows.map((row) => {
    const recs = recsByTheme.get(row.id) ?? []
    const catalysts = catalystsByTheme.get(row.id) ?? []
    const earliestEventDate = earliestByTheme.get(row.id) ?? null
    const children = childrenByParent.get(row.id) ?? []
    row.recent_drivers = null
    row.recent_drivers_generated_at = null
    return buildItem(row, recs, catalysts, earliestEventDate, null, children)
  })

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
      'conviction_score, conviction_breakdown, conviction_reasoning, conviction_reasoning_zh, conviction_generated_at, counter_evidence_summary, ' +
      'specific_playbook, specific_playbook_zh, ' +
      'theme_archetypes(category, playbook, playbook_zh, typical_duration_days_max)'
    )
    .eq('id', themeId)
    .single()

  if (error || !row) throw new Error(`theme not found: ${themeId}`)

  const themeRow = row as unknown as ThemeRow
  const [recs, catalysts, earliestEventDate, parent, children, drivers, exitTriggers, emerging] = await Promise.all([
    fetchRecommendations(themeId),
    fetchCatalysts(themeId, 50),
    fetchEarliestEventDate(themeId),
    fetchParent(themeRow.parent_theme_id),
    fetchChildren(themeId),
    fetchRecentDrivers(themeId),
    fetchExitSignalTriggers(themeId),
    fetchEmergingCandidates(themeId, themeRow.parent_theme_id),
  ])
  themeRow.recent_drivers = drivers.recent_drivers
  themeRow.recent_drivers_generated_at = drivers.recent_drivers_generated_at

  const item = buildItem(themeRow, recs, catalysts, earliestEventDate, parent, children, emerging)
  item.exit_signal_triggers = exitTriggers

  // Embed rich child theme data so the detail page can render full
  // <ThemeCard variant="secondary"> without a second /api/themes round-trip.
  if (children.length > 0) {
    const childIds = children.map((c) => c.id)
    const { themes: childItems } = await buildThemeRadar({ theme_ids: childIds })
    const byId = new Map(childItems.map((c) => [c.id, c]))
    item.child_themes_full = children
      .map((c) => byId.get(c.id))
      .filter((c): c is ThemeRadarItem => Boolean(c))
  }

  return item
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

async function fetchChildrenBatch(parentIds: string[]): Promise<Map<string, ThemeChildRef[]>> {
  const out = new Map<string, ThemeChildRef[]>()
  if (parentIds.length === 0) return out
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, name_zh, theme_strength_score, event_count, parent_theme_id')
    .in('parent_theme_id', parentIds)
    .in('status', ['active', 'cooling'])
    .order('theme_strength_score', { ascending: false })
  for (const r of (data ?? []) as Array<{
    id: string
    name: string
    name_zh: string | null
    theme_strength_score: number
    event_count: number
    parent_theme_id: string | null
  }>) {
    if (!r.parent_theme_id) continue
    let arr = out.get(r.parent_theme_id)
    if (!arr) { arr = []; out.set(r.parent_theme_id, arr) }
    arr.push({
      id: r.id,
      name: r.name,
      name_zh: r.name_zh ?? null,
      theme_strength_score: r.theme_strength_score,
      event_count: r.event_count,
    })
  }
  return out
}
