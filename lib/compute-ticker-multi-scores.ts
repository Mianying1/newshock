/**
 * Phase 2 · multi-score formula for theme_recommendations.
 *
 *   short_score    = 50·norm(events_7d, 0,80) + 30·hot_lt7_ratio  + 20·short_arch_ratio
 *   long_score (v3 · 2026-04-26) =
 *       40·norm(umbrella_depth_max, 0, UMBRELLA_DEPTH_CAP)        — depth, not breadth
 *     + 30·norm(events_90d, 0, EVENTS_90D_CAP)
 *     + 30·long_arch_concentration                                — extended OR inside-extended-umbrella
 *   potential_score= 30·in_new_angle + 20·max_candidate_confidence + 30·low_mainstream + 20·is_p1_revived
 *
 * Scores are ticker-level (not per-theme) — every row of a ticker in
 * theme_recommendations gets the same triple. Stored on theme_recommendations
 * for downstream query ergonomics.
 */
import { supabaseAdmin } from './supabase-admin'

// Archetype duration taxonomy in this DB: 'bounded' (~9-12mo, 20 archs) vs
// 'extended' (multi-year, 42 archs). Min typical_duration_days_max=270, so
// raw-day thresholds <270 match nothing — we map short→bounded, long→extended.
const SHORT_ARCH_DURATION_TYPE = 'bounded'
const LONG_ARCH_DURATION_TYPE = 'extended'
const HOT_RECENT_DAYS = 7
const EVENTS_7D_CAP = 80
const EVENTS_90D_CAP = 200
const UMBRELLA_DEPTH_CAP = 8
const LONG_HORIZON_DAYS = 365
const LOW_MAINSTREAM_THRESHOLD = 5

interface MapRow { ticker_symbol: string; theme_id: string }
interface ThemeRow {
  id: string
  status: string
  theme_tier: string | null
  archetype_id: string | null
  parent_theme_id: string | null
  days_hot: number | null
}
interface ArchRow {
  id: string
  typical_duration_days_max: number | null
  duration_type: string | null
}
interface EventRow { trigger_theme_id: string | null; event_date: string | null }
interface CandRow { proposed_tickers: string[] | null; confidence: number | null; status: string }

export interface ScoreBreakdown {
  short: { value: number; events_7d: number; hot_lt7_ratio: number; short_arch_ratio: number; events_term: number; hot_term: number; arch_term: number }
  long:  {
    value: number
    umbrella_depth_max: number
    umbrella_depth_cap: number
    deepest_umbrella_id: string | null
    events_90d: number
    long_arch_concentration: number
    long_arch_count: number
    total_arch_count: number
    umbrella_term: number
    events_term: number
    arch_term: number
  }
  potential: { value: number; in_new_angle: 0|1; max_candidate_confidence: number; mainstream_coverage: number; low_mainstream: 0|1; is_p1_revived: 0|1; my_mapping_count: number; novel_term: number; conf_term: number; lowmain_term: number; p1_term: number }
  diag: { mapped_themes: number; mapped_archetypes: number; active_themes: number }
}

export interface ScoreContext {
  byTicker: Map<string, ThemeRow[]>            // ticker → its themes (active+cooling+exploratory)
  themeById: Map<string, ThemeRow>             // global lookup (incl. parent umbrellas)
  archById: Map<string, ArchRow>
  events7dByTheme: Map<string, number>
  events90dByTheme: Map<string, number>
  newAngleByTicker: Map<string, { count: number; maxConfidence: number }>
  maxUmbrellaPerTicker: number                 // legacy diagnostic only
  avgMappingPerTicker: number                  // legacy diagnostic only
  globalTickerMappingCount: Map<string, number>
  p1RevivedTickers: Set<string>                // ticker whose ALL mappings have source='p1_auto_mapping'
}

function clip(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}
function normalize(x: number, min: number, max: number): number {
  if (max <= min) return 0
  return clip(((x - min) / (max - min)) * 100, 0, 100)
}

async function fetchAllPaginated<T>(build: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return out
}

export async function buildScoreContext(): Promise<ScoreContext> {
  const map = await fetchAllPaginated<MapRow & { source: string | null }>(() =>
    supabaseAdmin.from('theme_recommendations').select('ticker_symbol, theme_id, source')
  )

  // is_p1_revived: ticker exists ONLY with source='p1_auto_mapping'
  const sourcesByTicker = new Map<string, Set<string>>()
  for (const m of map) {
    const s = (m as { source: string | null }).source ?? 'manual'
    if (!sourcesByTicker.has(m.ticker_symbol)) sourcesByTicker.set(m.ticker_symbol, new Set())
    sourcesByTicker.get(m.ticker_symbol)!.add(s)
  }
  const p1RevivedTickers = new Set<string>()
  for (const [sym, srcs] of sourcesByTicker) {
    if (srcs.size === 1 && srcs.has('p1_auto_mapping')) p1RevivedTickers.add(sym)
  }
  const themeIds = [...new Set(map.map((m) => m.theme_id))]
  const tickerSyms = [...new Set(map.map((m) => m.ticker_symbol))]

  const themesPrimary = themeIds.length === 0
    ? []
    : await fetchAllPaginated<ThemeRow>(() =>
        supabaseAdmin
          .from('themes')
          .select('id, status, theme_tier, archetype_id, parent_theme_id, days_hot')
          .in('id', themeIds)
      )
  // Pull in parent umbrellas that aren't already mapped (so we can resolve
  // archetypes for the umbrella that a subtheme belongs to, even if no
  // ticker maps directly to that umbrella).
  const parentIds = [...new Set(
    themesPrimary
      .map((t) => t.parent_theme_id)
      .filter((x): x is string => !!x && !themeIds.includes(x))
  )]
  const parentRows = parentIds.length === 0
    ? []
    : await fetchAllPaginated<ThemeRow>(() =>
        supabaseAdmin
          .from('themes')
          .select('id, status, theme_tier, archetype_id, parent_theme_id, days_hot')
          .in('id', parentIds)
      )
  const themes = [...themesPrimary, ...parentRows]
  const themeById = new Map<string, ThemeRow>()
  for (const t of themes) themeById.set(t.id, t)

  const archIds = [...new Set(themes.map((t) => t.archetype_id).filter((x): x is string => !!x))]
  const archs = archIds.length === 0
    ? []
    : await fetchAllPaginated<ArchRow>(() =>
        supabaseAdmin
          .from('theme_archetypes')
          .select('id, typical_duration_days_max, duration_type')
          .in('id', archIds)
      )
  const archById = new Map<string, ArchRow>()
  for (const a of archs) archById.set(a.id, a)

  const now = Date.now()
  const d7Iso = new Date(now - 7 * 86400000).toISOString()
  const d90Iso = new Date(now - 90 * 86400000).toISOString()

  const events90d = themeIds.length === 0
    ? []
    : await fetchAllPaginated<EventRow>(() =>
        supabaseAdmin
          .from('events')
          .select('trigger_theme_id, event_date')
          .gte('event_date', d90Iso)
          .in('trigger_theme_id', themeIds)
      )
  const events7dByTheme = new Map<string, number>()
  const events90dByTheme = new Map<string, number>()
  for (const e of events90d) {
    if (!e.trigger_theme_id) continue
    events90dByTheme.set(e.trigger_theme_id, (events90dByTheme.get(e.trigger_theme_id) ?? 0) + 1)
    if (e.event_date && e.event_date >= d7Iso) {
      events7dByTheme.set(e.trigger_theme_id, (events7dByTheme.get(e.trigger_theme_id) ?? 0) + 1)
    }
  }

  // Per-ticker theme list — only ACTIVE-ish themes count for the formula.
  // Dedup on theme_id within a ticker (multi-row mappings shouldn't double-count).
  const byTicker = new Map<string, ThemeRow[]>()
  const seenByTicker = new Map<string, Set<string>>()
  const globalTickerMappingCount = new Map<string, number>()
  for (const m of map) {
    const t = themeById.get(m.theme_id)
    if (!t) continue
    if (!['active', 'cooling', 'exploratory_candidate'].includes(t.status)) continue
    if (!byTicker.has(m.ticker_symbol)) {
      byTicker.set(m.ticker_symbol, [])
      seenByTicker.set(m.ticker_symbol, new Set())
    }
    const seen = seenByTicker.get(m.ticker_symbol)!
    if (seen.has(t.id)) continue
    seen.add(t.id)
    byTicker.get(m.ticker_symbol)!.push(t)
  }
  for (const sym of tickerSyms) {
    globalTickerMappingCount.set(sym, byTicker.get(sym)?.length ?? 0)
  }

  // umbrella max + avg mapping count
  let maxUmbrella = 1
  let totalMaps = 0
  let nTickers = 0
  for (const [, arr] of byTicker) {
    const u = arr.filter((t) => t.theme_tier === 'umbrella').length
    if (u > maxUmbrella) maxUmbrella = u
    totalMaps += arr.length
    nTickers++
  }
  const avgMappingPerTicker = nTickers > 0 ? totalMaps / nTickers : 1

  // new_angle_candidates per ticker
  const cands = await fetchAllPaginated<CandRow>(() =>
    supabaseAdmin
      .from('new_angle_candidates')
      .select('proposed_tickers, confidence, status')
  )
  const newAngleByTicker = new Map<string, { count: number; maxConfidence: number }>()
  for (const c of cands) {
    if (c.status === 'rejected') continue
    const tickers = c.proposed_tickers ?? []
    const conf = typeof c.confidence === 'number' ? c.confidence : 0
    for (const sym of tickers) {
      const cur = newAngleByTicker.get(sym) ?? { count: 0, maxConfidence: 0 }
      cur.count++
      if (conf > cur.maxConfidence) cur.maxConfidence = conf
      newAngleByTicker.set(sym, cur)
    }
  }

  return {
    byTicker,
    themeById,
    archById,
    events7dByTheme,
    events90dByTheme,
    newAngleByTicker,
    maxUmbrellaPerTicker: maxUmbrella,
    avgMappingPerTicker,
    globalTickerMappingCount,
    p1RevivedTickers,
  }
}

export function computeTickerScores(symbol: string, ctx: ScoreContext): ScoreBreakdown {
  const themes = ctx.byTicker.get(symbol) ?? []
  const totalThemes = themes.length
  const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0)

  // ── SHORT
  let events7d = 0
  for (const t of themes) events7d += ctx.events7dByTheme.get(t.id) ?? 0
  const hotLt7 = themes.filter((t) => t.days_hot != null && t.days_hot < HOT_RECENT_DAYS).length
  const hotLt7Ratio = safeDiv(hotLt7, totalThemes)

  const archIdsForTicker = [...new Set(themes.map((t) => t.archetype_id).filter((x): x is string => !!x))]
  const totalArchs = archIdsForTicker.length
  const shortArchs = archIdsForTicker.filter((id) => {
    const a = ctx.archById.get(id)
    return a?.duration_type === SHORT_ARCH_DURATION_TYPE
  }).length
  const shortArchRatio = safeDiv(shortArchs, totalArchs)

  const events_term = 50 * (normalize(events7d, 0, EVENTS_7D_CAP) / 100)
  const hot_term = 30 * hotLt7Ratio
  const arch_term = 20 * shortArchRatio
  const short_value = Math.round(clip(events_term + hot_term + arch_term, 0, 100))

  // ── LONG (v3 · 2026-04-26)
  // Term 1 · umbrella_depth — depth, not breadth.
  //   For each umbrella, count this ticker's subtheme mappings under it.
  //   Score = max depth across umbrellas, capped at UMBRELLA_DEPTH_CAP.
  const depthByUmbrella = new Map<string, number>()
  // Direct umbrella mappings count as depth=1 toward themselves.
  for (const t of themes) {
    if (t.theme_tier === 'umbrella') {
      depthByUmbrella.set(t.id, (depthByUmbrella.get(t.id) ?? 0) + 1)
    }
  }
  // Subthemes contribute depth to their parent umbrella.
  for (const t of themes) {
    if (t.theme_tier === 'umbrella') continue
    if (!t.parent_theme_id) continue
    depthByUmbrella.set(t.parent_theme_id, (depthByUmbrella.get(t.parent_theme_id) ?? 0) + 1)
  }
  let umbrellaDepthMax = 0
  let deepestUmbrellaId: string | null = null
  for (const [umbId, depth] of depthByUmbrella) {
    if (depth > umbrellaDepthMax) {
      umbrellaDepthMax = depth
      deepestUmbrellaId = umbId
    }
  }

  // Term 2 · sustained events 90d, cap raised to 200.
  let events90d = 0
  for (const t of themes) events90d += ctx.events90dByTheme.get(t.id) ?? 0

  // Term 3 · long-archetype concentration — count an arch as "long" if it
  // is itself extended/long-day, OR if it belongs to a parent umbrella
  // whose archetype is long-horizon (so tactical bounded catalysts inside
  // a multi-year capex cycle don't drag the ratio down).
  function isLongArch(archId: string): boolean {
    const a = ctx.archById.get(archId)
    if (!a) return false
    if (a.duration_type === LONG_ARCH_DURATION_TYPE) return true
    if ((a.typical_duration_days_max ?? 0) > LONG_HORIZON_DAYS) return true
    return false
  }
  function archInheritsLong(t: ThemeRow): boolean {
    let cur: ThemeRow | null = t
    let hops = 0
    while (cur && hops < 4) {
      if (cur.archetype_id && isLongArch(cur.archetype_id)) return true
      cur = cur.parent_theme_id ? ctx.themeById.get(cur.parent_theme_id) ?? null : null
      hops++
    }
    return false
  }
  // For each unique arch_id on this ticker, decide long vs short under the
  // inheritance rule: pick the most generous classification across themes
  // that bear this arch.
  const longByArch = new Map<string, boolean>()
  for (const t of themes) {
    if (!t.archetype_id) continue
    if (longByArch.get(t.archetype_id)) continue
    longByArch.set(t.archetype_id, archInheritsLong(t))
  }
  const totalArchCount = longByArch.size
  let longArchCount = 0
  for (const v of longByArch.values()) if (v) longArchCount++
  const longArchConcentration = safeDiv(longArchCount, totalArchCount)

  const umbrella_term = 40 * (normalize(umbrellaDepthMax, 0, UMBRELLA_DEPTH_CAP) / 100)
  const events90_term = 30 * (normalize(events90d, 0, EVENTS_90D_CAP) / 100)
  const longarch_term = 30 * longArchConcentration
  const long_value = Math.round(clip(umbrella_term + events90_term + longarch_term, 0, 100))

  // ── POTENTIAL (rewritten · v2)
  //   30 × in_new_angle
  // + 20 × max_candidate_confidence
  // + 30 × low_mainstream (mappings ≤ 5)
  // + 20 × is_p1_revived
  const ang = ctx.newAngleByTicker.get(symbol)
  const inNewAngle: 0 | 1 = ang && ang.count > 0 ? 1 : 0
  const maxConf = ang?.maxConfidence ?? 0
  const myMappingCount = ctx.globalTickerMappingCount.get(symbol) ?? 0
  const lowMainstream: 0 | 1 = myMappingCount <= LOW_MAINSTREAM_THRESHOLD ? 1 : 0
  const isP1Revived: 0 | 1 = ctx.p1RevivedTickers.has(symbol) ? 1 : 0
  // legacy diagnostic only (no longer drives score)
  const mainstreamCoverage = clip(safeDiv(myMappingCount, ctx.avgMappingPerTicker), 0, 1)

  const novel_term = 30 * inNewAngle
  const conf_term = 20 * maxConf
  const lowmain_term = 30 * lowMainstream
  const p1_term = 20 * isP1Revived
  const potential_value = Math.round(clip(novel_term + conf_term + lowmain_term + p1_term, 0, 100))

  return {
    short: { value: short_value, events_7d: events7d, hot_lt7_ratio: hotLt7Ratio, short_arch_ratio: shortArchRatio, events_term, hot_term, arch_term },
    long:  {
      value: long_value,
      umbrella_depth_max: umbrellaDepthMax,
      umbrella_depth_cap: UMBRELLA_DEPTH_CAP,
      deepest_umbrella_id: deepestUmbrellaId,
      events_90d: events90d,
      long_arch_concentration: longArchConcentration,
      long_arch_count: longArchCount,
      total_arch_count: totalArchCount,
      umbrella_term,
      events_term: events90_term,
      arch_term: longarch_term,
    },
    potential: { value: potential_value, in_new_angle: inNewAngle, max_candidate_confidence: maxConf, mainstream_coverage: mainstreamCoverage, low_mainstream: lowMainstream, is_p1_revived: isP1Revived, my_mapping_count: myMappingCount, novel_term, conf_term, lowmain_term, p1_term },
    diag: { mapped_themes: totalThemes, mapped_archetypes: totalArchs, active_themes: themes.filter((t) => t.status === 'active').length },
  }
}
