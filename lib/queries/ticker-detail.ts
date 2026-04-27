/**
 * Ticker Detail aggregator (sections 03 / 04 / 05).
 *
 * Single fetch returns themes / playbooks / events for the ticker page.
 * 02 Core Narrative is served by /api/tickers/[symbol]/narrative — this lib
 * intentionally does NOT touch ticker_narratives.
 *
 * Locale-aware: zh/en label fields and relative-time strings are computed
 * server-side based on the locale param, so the client component does not
 * need locale logic for these sections.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ExposureDirection } from '@/types/recommendations'

export type Loc = 'zh' | 'en'

export interface TickerDetailThemeCard {
  themeId: string
  fullThemeId: string | null
  label: string
  exposurePct: number | null
  tier: number
  exposureDirection: ExposureDirection | string | null
  roleReasoning: string | null
  themeStrength: number | null
  category: string | null
  horizonLabel: string | null
  eventCount: number | null
  updatedAgo: string | null
  daysActive: number | null
  expectedDuration: string | null
}

export interface TickerDetailAllThemes {
  themeId: string
  name: string
  tier: number
  exposureDirection: ExposureDirection | string | null
  daysActive: number
}

export interface TickerDetailPlaybookCase {
  year: string | number | null
  name: string
  result: string | null
}

export interface TickerDetailPlaybook {
  themeId: string
  themeLabel: string
  archetypeId: string | null
  observation: string | null
  historicalCases: TickerDetailPlaybookCase[]
  exitSignals: string[]
}

export interface TickerDetailEvent {
  id: string
  date: string
  headline: string
  sourceName: string | null
  sourceUrl: string | null
  impact: 'high' | 'medium' | 'low' | null
  themeId: string | null
  themeName: string | null
}

export interface TickerDetailBundle {
  topThemes: TickerDetailThemeCard[]
  allActive: TickerDetailAllThemes[]
  playbooks: TickerDetailPlaybook[]
  events: TickerDetailEvent[]
  totals: { coreCount: number; activeCount: number }
}

// CJK detector — same approach as recommendation-builder.ts (sampled fields).
function isCJK(playbook: unknown): boolean {
  if (!playbook || typeof playbook !== 'object') return false
  const p = playbook as {
    historical_cases?: Array<{ name?: string; exit_trigger?: string }>
    this_time_different?: { observation?: string }
    exit_signals?: string[]
  }
  const sample = [
    p.this_time_different?.observation ?? '',
    p.historical_cases?.[0]?.name ?? '',
    p.historical_cases?.[0]?.exit_trigger ?? '',
    p.exit_signals?.[0] ?? '',
  ].join(' ')
  return /[\u4e00-\u9fff]/.test(sample)
}

function pickLocalePlaybook(
  loc: Loc,
  specific: unknown,
  specificZh: unknown,
  archetype: unknown,
  archetypeZh: unknown,
): unknown | null {
  if (loc === 'zh') {
    if (specificZh) return specificZh
    if (specific && isCJK(specific)) return specific
    if (archetypeZh) return archetypeZh
    if (archetype && isCJK(archetype)) return archetype
    return null
  }
  if (specific && !isCJK(specific)) return specific
  if (archetype && !isCJK(archetype)) return archetype
  return null
}

function relativeTime(iso: string | null, loc: Loc): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const hours = Math.round(ms / 3600000)
  if (hours < 1) return loc === 'zh' ? '刚刚' : 'just now'
  if (hours < 24) return loc === 'zh' ? `${hours} 小时前` : `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return loc === 'zh' ? `${days} 天前` : `${days}d ago`
  const weeks = Math.round(days / 7)
  return loc === 'zh' ? `${weeks} 周前` : `${weeks}w ago`
}

function horizonFromDuration(durationType: string | null, loc: Loc): string | null {
  if (!durationType) return null
  if (loc === 'zh') {
    if (durationType === 'extended') return '长期 12 个月+'
    if (durationType === 'bounded') return '中期 3-12 个月'
    if (durationType === 'dependent') return '事件驱动'
    return null
  }
  if (durationType === 'extended') return 'Long-term 12m+'
  if (durationType === 'bounded') return 'Medium 3-12m'
  if (durationType === 'dependent') return 'Event-driven'
  return null
}

function expectedDurationLabel(coverage: unknown, loc: Loc): string | null {
  if (!coverage || typeof coverage !== 'object') {
    return loc === 'zh' ? '暂不明确' : 'TBD'
  }
  const c = coverage as { typical_duration_label?: string; typical_duration_label_zh?: string }
  if (loc === 'zh' && c.typical_duration_label_zh) return c.typical_duration_label_zh
  if (c.typical_duration_label) return c.typical_duration_label
  return loc === 'zh' ? '暂不明确' : 'TBD'
}

function tierFromExposure(exposurePct: number | null, fallback: number): number {
  if (exposurePct == null) return fallback
  if (exposurePct >= 70) return 1
  if (exposurePct >= 40) return 2
  return 3
}

function normalizeImpact(s: string | null): 'high' | 'medium' | 'low' | null {
  if (!s) return null
  const v = s.toLowerCase()
  if (v === 'high' || v === 'medium' || v === 'low') return v
  // Pipeline currently emits 'event_only' as the default classification —
  // surface it as 'medium' so the UI gets a neutral pill instead of nothing.
  if (v === 'event_only') return 'medium'
  return null
}

function daysActiveFrom(firstSeen: string | null, lastActive: string | null): number {
  if (!firstSeen) return 0
  const start = new Date(firstSeen).getTime()
  const end = lastActive ? new Date(lastActive).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.floor((end - start) / 86400000))
}

function buildPlaybook(
  themeId: string,
  themeLabel: string,
  archetypeId: string | null,
  pb: unknown,
): TickerDetailPlaybook | null {
  if (!pb || typeof pb !== 'object') return null
  const p = pb as {
    this_time_different?: { observation?: string }
    historical_cases?: Array<{
      name?: string
      year?: number | string
      approximate_duration?: string
      peak_move?: string
      exit_trigger?: string
    }>
    exit_signals?: string[]
  }
  const observation = p.this_time_different?.observation ?? null
  const historicalCases: TickerDetailPlaybookCase[] = (p.historical_cases ?? [])
    .slice(0, 4)
    .map((c) => ({
      year: c.year ?? null,
      name: c.name ?? '',
      result: c.peak_move
        ? `${c.peak_move}${c.exit_trigger ? ` · ${c.exit_trigger}` : ''}`
        : c.exit_trigger ?? null,
    }))
    .filter((c) => c.name)
  const exitSignals = (p.exit_signals ?? []).slice(0, 4)
  if (!observation && historicalCases.length === 0 && exitSignals.length === 0) return null
  return {
    themeId,
    themeLabel,
    archetypeId,
    observation,
    historicalCases,
    exitSignals,
  }
}

interface RecRow {
  theme_id: string
  tier: number | null
  exposure_pct: number | null
  exposure_direction: string | null
  role_reasoning: string | null
  role_reasoning_zh: string | null
  themes: {
    id: string
    name: string
    name_zh: string | null
    status: string
    archetype_id: string | null
    theme_strength_score: number | null
    first_seen_at: string | null
    last_active_at: string | null
    event_count: number | null
    expected_coverage: unknown
    specific_playbook: unknown
    specific_playbook_zh: unknown
    theme_archetypes: {
      category: string | null
      duration_type: string | null
      playbook: unknown
      playbook_zh: unknown
    } | null
  } | null
}

interface EventRow {
  id: string
  headline: string | null
  short_headline: string | null
  short_headline_zh: string | null
  source_name: string | null
  source_url: string | null
  event_date: string | null
  level_of_impact: string | null
  trigger_theme_id: string | null
}

export async function fetchTickerDetail(
  symbol: string,
  loc: Loc,
): Promise<TickerDetailBundle> {
  const sym = symbol.toUpperCase()

  const [recsRes, eventsRes] = await Promise.allSettled([
    supabaseAdmin
      .from('theme_recommendations')
      .select(
        `theme_id, tier, exposure_pct, exposure_direction, role_reasoning, role_reasoning_zh,
         themes!inner (
           id, name, name_zh, status, archetype_id, theme_strength_score,
           first_seen_at, last_active_at, event_count, expected_coverage,
           specific_playbook, specific_playbook_zh,
           theme_archetypes ( category, duration_type, playbook, playbook_zh )
         )`,
      )
      .eq('ticker_symbol', sym)
      .or('confidence_band.is.null,confidence_band.neq.low'),
    supabaseAdmin
      .from('events')
      .select(
        'id, headline, short_headline, short_headline_zh, source_name, source_url, event_date, level_of_impact, trigger_theme_id',
      )
      .contains('mentioned_tickers', [sym])
      .order('event_date', { ascending: false })
      .limit(20),
  ])

  // Themes/playbooks -----------------------------------------------------------
  let topThemes: TickerDetailThemeCard[] = []
  let allActive: TickerDetailAllThemes[] = []
  let playbooks: TickerDetailPlaybook[] = []
  let coreCount = 0
  let activeCount = 0
  const themeNameById = new Map<string, string>()

  if (recsRes.status === 'fulfilled' && !recsRes.value.error) {
    const rows = (recsRes.value.data ?? []) as unknown as RecRow[]
    const active = rows.filter((r) => r.themes?.status === 'active')
    activeCount = active.length

    for (const r of active) {
      if (r.themes) {
        themeNameById.set(
          r.themes.id,
          loc === 'zh' ? r.themes.name_zh ?? r.themes.name : r.themes.name,
        )
      }
    }

    const cards: TickerDetailThemeCard[] = active.map((r) => {
      const th = r.themes!
      const tier = tierFromExposure(r.exposure_pct, r.tier ?? 3)
      const label = loc === 'zh' ? th.name_zh ?? th.name : th.name
      return {
        themeId: th.id,
        fullThemeId: th.id,
        label,
        exposurePct: r.exposure_pct,
        tier,
        exposureDirection: r.exposure_direction,
        roleReasoning: loc === 'zh' ? r.role_reasoning_zh ?? r.role_reasoning : r.role_reasoning,
        themeStrength: th.theme_strength_score,
        category: th.theme_archetypes?.category ?? null,
        horizonLabel: horizonFromDuration(th.theme_archetypes?.duration_type ?? null, loc),
        eventCount: th.event_count,
        updatedAgo: relativeTime(th.last_active_at, loc),
        daysActive: daysActiveFrom(th.first_seen_at, th.last_active_at),
        expectedDuration: expectedDurationLabel(th.expected_coverage, loc),
      }
    })

    cards.sort((a, b) => {
      const ax = a.exposurePct ?? -1
      const bx = b.exposurePct ?? -1
      if (bx !== ax) return bx - ax
      return (b.themeStrength ?? 0) - (a.themeStrength ?? 0)
    })

    topThemes = cards.slice(0, 2)
    coreCount = topThemes.length

    allActive = cards.map((c) => ({
      themeId: c.fullThemeId ?? c.themeId,
      name: c.label,
      tier: c.tier,
      exposureDirection: c.exposureDirection,
      daysActive: c.daysActive ?? 0,
    }))

    playbooks = topThemes
      .map((card) => {
        const r = active.find((row) => row.themes?.id === card.themeId)
        const th = r?.themes
        if (!th) return null
        const pb = pickLocalePlaybook(
          loc,
          th.specific_playbook,
          th.specific_playbook_zh,
          th.theme_archetypes?.playbook,
          th.theme_archetypes?.playbook_zh,
        )
        return buildPlaybook(card.themeId, card.label, th.archetype_id, pb)
      })
      .filter((p): p is TickerDetailPlaybook => p !== null)
  }

  // Events ---------------------------------------------------------------------
  let events: TickerDetailEvent[] = []
  if (eventsRes.status === 'fulfilled' && !eventsRes.value.error) {
    const rows = (eventsRes.value.data ?? []) as EventRow[]
    events = rows.slice(0, 12).map((e) => {
      const headline =
        loc === 'zh'
          ? e.short_headline_zh ?? e.short_headline ?? e.headline ?? ''
          : e.short_headline ?? e.headline ?? ''
      return {
        id: e.id,
        date: e.event_date ?? new Date().toISOString(),
        headline,
        sourceName: e.source_name,
        sourceUrl: e.source_url,
        impact: normalizeImpact(e.level_of_impact),
        themeId: e.trigger_theme_id,
        themeName: e.trigger_theme_id ? themeNameById.get(e.trigger_theme_id) ?? null : null,
      }
    })
  }

  return {
    topThemes,
    allActive,
    playbooks,
    events,
    totals: { coreCount, activeCount },
  }
}
