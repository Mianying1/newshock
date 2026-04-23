import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase-admin'
import { anthropic, MODEL_SONNET } from './anthropic'

export interface ConvictionBreakdown {
  historical_fit: number
  evidence_strength: number
  priced_in_risk: number
  exit_signal_distance: number
}

export interface ScoreBreakdown {
  directness: number
  purity: number
  sensitivity: number
  crowding_penalty: number
  mega_cap_penalty: number
}

export interface ConvictionResult {
  theme_id: string
  score: number
  breakdown: ConvictionBreakdown
  reasoning: string
  reasoning_zh: string
  cost_usd: number
}

interface ThemeRow {
  id: string
  name: string
  name_zh: string | null
  summary: string | null
  summary_zh: string | null
  status: string | null
  days_hot: number | null
  theme_strength_score: number | null
  first_seen_at: string | null
  archetype_id: string | null
}

interface EventRow {
  id: string
  event_date: string
  headline: string
  source_name: string | null
}

interface ArchetypeRow {
  id: string
  name: string
  typical_duration_days_max: number | null
  playbook: { exit_signals?: string[] } | null
}

interface RecRow {
  ticker_symbol: string
  tier: number | null
  exposure_direction: string | null
}

const WEIGHTS = {
  historical_fit: 0.3,
  evidence_strength: 0.3,
  priced_in_risk_inverted: 0.2,
  exit_signal_distance: 0.2,
} as const

function clamp(n: number, lo = 0, hi = 10): number {
  if (Number.isNaN(n)) return 0
  return Math.max(lo, Math.min(hi, n))
}

export function computeOverallConviction(b: ConvictionBreakdown): number {
  const hist = clamp(b.historical_fit)
  const ev = clamp(b.evidence_strength)
  const priced = clamp(b.priced_in_risk)
  const exit = clamp(b.exit_signal_distance)
  const weighted =
    WEIGHTS.historical_fit * hist +
    WEIGHTS.evidence_strength * ev +
    WEIGHTS.priced_in_risk_inverted * (10 - priced) +
    WEIGHTS.exit_signal_distance * exit
  return Math.round(weighted * 10) / 10
}

function extractJson(text: string): string | null {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  return text.slice(first, last + 1)
}

async function fetchTheme(themeId: string): Promise<ThemeRow | null> {
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, name_zh, summary, summary_zh, status, days_hot, theme_strength_score, first_seen_at, archetype_id')
    .eq('id', themeId)
    .single()
  return (data as ThemeRow) ?? null
}

async function fetchRecentEvents(themeId: string, days = 30): Promise<EventRow[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data } = await supabaseAdmin
    .from('events')
    .select('id, event_date, headline, source_name')
    .eq('trigger_theme_id', themeId)
    .gte('event_date', since)
    .order('event_date', { ascending: false })
    .limit(30)
  return (data as EventRow[]) ?? []
}

async function fetchEventCount(themeId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('trigger_theme_id', themeId)
  return count ?? 0
}

async function fetchRecommendations(themeId: string): Promise<RecRow[]> {
  const { data } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol, tier, exposure_direction')
    .eq('theme_id', themeId)
    .limit(50)
  return (data as RecRow[]) ?? []
}

async function fetchArchetype(archetypeId: string | null): Promise<ArchetypeRow | null> {
  if (!archetypeId) return null
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, typical_duration_days_max, playbook')
    .eq('id', archetypeId)
    .single()
  return (data as ArchetypeRow) ?? null
}

export async function computeConviction(themeId: string): Promise<ConvictionResult> {
  const theme = await fetchTheme(themeId)
  if (!theme) throw new Error(`theme ${themeId} not found`)

  const [events, totalEvents, recs, archetype] = await Promise.all([
    fetchRecentEvents(themeId, 30),
    fetchEventCount(themeId),
    fetchRecommendations(themeId),
    fetchArchetype(theme.archetype_id),
  ])

  const firstSeen = theme.first_seen_at ? new Date(theme.first_seen_at) : null
  const daysSinceStart = firstSeen
    ? Math.floor((Date.now() - firstSeen.getTime()) / 86400000)
    : null
  const typicalMax = archetype?.typical_duration_days_max ?? null
  const playbookExitSignals = archetype?.playbook?.exit_signals ?? []

  const system =
    `You are a macro investment analyst. Evaluate a theme's conviction on four dimensions. ` +
    `Use cautious language (historically / may / appears to). Never claim certainty. ` +
    `For reasoning_zh: write natural Chinese only · do NOT code-switch · do NOT leave English words like "historically" / "appears to" embedded in Chinese text. ` +
    `Write "历史上" instead of "historically有先例". ` +
    `Exceptions: ticker symbols and currency units (USD, $4.76B) may stay in English. ` +
    `Return ONLY a JSON object. No prose outside the JSON.`

  const user =
    `THEME\n` +
    `  id: ${theme.id}\n` +
    `  name: ${theme.name}${theme.name_zh ? ` (${theme.name_zh})` : ''}\n` +
    `  status: ${theme.status ?? 'unknown'}\n` +
    `  summary: ${theme.summary ?? '(none)'}\n` +
    `  days since first seen: ${daysSinceStart ?? 'unknown'}\n` +
    `  archetype typical max duration: ${typicalMax ?? 'unknown'} days\n` +
    `  archetype exit signals: ${playbookExitSignals.length > 0 ? playbookExitSignals.join('; ') : '(none)'}\n` +
    `  total linked events: ${totalEvents}\n` +
    `  days_hot: ${theme.days_hot ?? 0}\n` +
    `  theme_strength_score: ${theme.theme_strength_score ?? 'unknown'}\n` +
    `  ticker recommendations: ${recs.length}\n\n` +
    `RECENT EVENTS (last 30 days · up to 30):\n` +
    (events.length > 0
      ? events
          .slice(0, 10)
          .map((e) => `  · [${e.event_date?.slice(0, 10) ?? '?'}] ${e.headline}${e.source_name ? ` (${e.source_name})` : ''}`)
          .join('\n')
      : '  (none)') +
    `\n\nSCORE EACH DIMENSION 0-10:\n` +
    `1. historical_fit · Has a similar theme played out historically?\n` +
    `   clear precedent → 8-10 · loose analogue → 5-7 · brand new → 0-4\n` +
    `2. evidence_strength · Do existing events firmly support the theme?\n` +
    `   multi-source, consistent → 8-10 · single source or partial → 5-7 · weak → 0-4\n` +
    `3. priced_in_risk · How much has the market already priced this in?\n` +
    `   fully priced (no room) → 0-3 · partly priced → 4-7 · unrecognized → 8-10\n` +
    `   NOTE: this score is INVERTED in the weighted overall (more priced = more unfavorable).\n` +
    `4. exit_signal_distance · How far from theme cooling/exit?\n` +
    `   just starting → 8-10 · mid · 5-7 · late / cooling imminent → 0-4\n\n` +
    `RETURN JSON:\n` +
    `{\n` +
    `  "historical_fit": number,\n` +
    `  "evidence_strength": number,\n` +
    `  "priced_in_risk": number,\n` +
    `  "exit_signal_distance": number,\n` +
    `  "reasoning": "2-3 sentences · English · cautious",\n` +
    `  "reasoning_zh": "2-3 句 · 中文 · 克制"\n` +
    `}\n` +
    `Do NOT include overall_conviction — it is computed server-side.`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 800,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const raw = msg.content
    .flatMap((c) => (c.type === 'text' ? [c.text] : []))
    .join('')
    .trim()

  const json = extractJson(raw)
  if (!json) throw new Error(`no JSON in response: ${raw.slice(0, 200)}`)
  const parsed = JSON.parse(json) as {
    historical_fit?: number
    evidence_strength?: number
    priced_in_risk?: number
    exit_signal_distance?: number
    reasoning?: string
    reasoning_zh?: string
  }

  const breakdown: ConvictionBreakdown = {
    historical_fit: clamp(Number(parsed.historical_fit ?? 0)),
    evidence_strength: clamp(Number(parsed.evidence_strength ?? 0)),
    priced_in_risk: clamp(Number(parsed.priced_in_risk ?? 0)),
    exit_signal_distance: clamp(Number(parsed.exit_signal_distance ?? 0)),
  }
  const score = computeOverallConviction(breakdown)
  const reasoning = (parsed.reasoning ?? '').trim()
  const reasoning_zh = (parsed.reasoning_zh ?? '').trim()

  const inputTokens = msg.usage?.input_tokens ?? 0
  const outputTokens = msg.usage?.output_tokens ?? 0
  const cost_usd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

  await supabaseAdmin
    .from('themes')
    .update({
      conviction_score: score,
      conviction_breakdown: breakdown,
      conviction_reasoning: reasoning,
      conviction_reasoning_zh: reasoning_zh,
      conviction_generated_at: new Date().toISOString(),
    })
    .eq('id', themeId)

  return {
    theme_id: themeId,
    score,
    breakdown,
    reasoning,
    reasoning_zh,
    cost_usd,
  }
}

export interface ComputeBatchResult {
  ok: Array<{ theme_id: string; name: string; score: number; cost_usd: number }>
  failed: Array<{ theme_id: string; name: string; error: string }>
  total_cost_usd: number
}

export async function computeConvictionForActiveThemes(): Promise<ComputeBatchResult> {
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('status', 'active')
    .order('conviction_generated_at', { ascending: true, nullsFirst: true })

  const ok: ComputeBatchResult['ok'] = []
  const failed: ComputeBatchResult['failed'] = []
  let total_cost_usd = 0

  for (const th of (themes ?? []) as { id: string; name: string }[]) {
    try {
      const r = await computeConviction(th.id)
      ok.push({ theme_id: th.id, name: th.name, score: r.score, cost_usd: r.cost_usd })
      total_cost_usd += r.cost_usd
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      failed.push({ theme_id: th.id, name: th.name, error: msg.slice(0, 300) })
    }
  }

  return { ok, failed, total_cost_usd }
}

// TODO Phase 4 · Per-recommendation score_breakdown
// 计算每个 theme_recommendation 的 5 维度分数:
//   directness       (直接受益度)
//   purity           (业务纯度 · 主营占比)
//   sensitivity      (业绩/股价对主题的弹性)
//   crowding_penalty (同一 ticker 出现在 >N 主题 · 扣分)
//   mega_cap_penalty (市值过大 · 稀释效应 · 扣分)
export async function computeRecommendationScore(
  _supabase: SupabaseClient,
  _recommendationId: string
): Promise<ScoreBreakdown> {
  throw new Error('Phase 4 · computeRecommendationScore not implemented yet')
}
