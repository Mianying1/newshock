import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'

export const REFINE_VERSION = 'v1'

export interface CurrentRec {
  ticker_symbol: string
  company_name: string
  tier: number
  exposure_direction: string | null
  role_reasoning: string | null
  role_reasoning_zh: string | null
  business_exposure: string | null
  business_exposure_zh: string | null
  catalyst: string | null
  catalyst_zh: string | null
  risk: string | null
  risk_zh: string | null
  market_cap_band: string | null
  is_pure_play: boolean | null
  is_often_missed: boolean | null
  is_thematic_tool: boolean | null
  confidence: number | null
}

export interface RefineInput {
  theme: {
    id: string
    name: string
    summary: string | null
  }
  archetype: {
    category: string | null
    playbook: Record<string, unknown> | null
  } | null
  current_recs: CurrentRec[]
}

export type ExposureType = 'direct' | 'observational' | 'pressure'
export type ConfidenceBand = 'high' | 'medium' | 'low'

export interface RefinedRec {
  ticker_symbol: string
  exposure_type: ExposureType
  confidence_band: ConfidenceBand
  role_reasoning: string
  role_reasoning_zh: string
  business_exposure: string
  business_exposure_zh: string
  catalyst: string | null
  catalyst_zh: string | null
  risk: string | null
  risk_zh: string | null
  notes?: string
}

export interface RefinedRemoval {
  ticker: string
  reason: string
}

export interface RefineOutput {
  refined_recommendations: RefinedRec[]
  removed_from_existing: RefinedRemoval[]
  refinement_summary: string
}

export interface RefineStats {
  input_tokens: number
  output_tokens: number
  cost_usd: number
  elapsed_sec: number
  stop_reason: string | null
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

function summarizePlaybook(pb: Record<string, unknown> | null): string {
  if (!pb) return '(no playbook)'
  const p = pb as { thesis?: string; duration_type?: string }
  return `${p.thesis ?? '(no thesis)'} · duration=${p.duration_type ?? '?'}`
}

function buildPrompt(input: RefineInput): string {
  const { theme, archetype, current_recs } = input
  const recsBlock = current_recs
    .map((r) => {
      const tags: string[] = []
      if (r.is_pure_play) tags.push('pure_play')
      if (r.is_often_missed) tags.push('often_missed')
      if (r.is_thematic_tool) tags.push('thematic_tool(≥3_themes)')
      const tagStr = tags.length ? ` [${tags.join(', ')}]` : ''
      return [
        `- ${r.ticker_symbol} · ${r.company_name} · T${r.tier} · ${r.exposure_direction ?? '?'} · ${r.market_cap_band ?? '?'} · conf=${r.confidence ?? '?'}${tagStr}`,
        `    reasoning: ${truncate(r.role_reasoning, 160)}`,
        `    exposure: ${truncate(r.business_exposure, 120)}`,
        `    catalyst: ${truncate(r.catalyst, 100)}`,
        `    risk: ${truncate(r.risk, 100)}`,
      ].join('\n')
    })
    .join('\n')

  return `You are refining a thematic research tool's recommendation list.

Newshock is an INFORMATION TOOL, not investment advice. Language must be observational and framework-based, not conclusive.

THEME:
Name: ${theme.name}
Summary: ${theme.summary ?? '(no summary)'}
Category: ${archetype?.category ?? 'unknown'}
Playbook: ${summarizePlaybook(archetype?.playbook ?? null)}

CURRENT RECOMMENDATIONS (${current_recs.length} tickers):
${recsBlock}

===

TASK: Refine the list. Fewer, harder signals. Not a memo.

HARD CONSTRAINTS:
- Max 12 tickers TOTAL across all 3 categories.
- Direct Exposure: 3-5 (STRICT — only if >70% of business genuinely tied to theme)
- Observational Mapping: 3-5 (historical pattern / correlation · NOT a direct beneficiary · "may" / "historically" language)
- Pressure Assets: 2-3 RECOMMENDED, MINIMUM 1.
    Pressure is NOT limited to direct negative — it includes:
    * Cost pressure (airlines via jet fuel, retailers via freight)
    * Substitute / reverse hedge (defensive sectors, crypto, gold in risk-on themes)
    * Downstream margin squeeze (processors when input prices spike)
    * Displaced incumbent (legacy tech, dated biz models)
    If the theme genuinely has only 1 plausible pressure candidate, 1 is acceptable
    — but you MUST include at least 1, and you MUST state the mechanism clearly
    in the reasoning and notes fields.

REMOVE:
- Same-class redundant ETFs (GLD+IAU → keep one; SPY/VOO duplication; ARKK/ARKW)
- Tool ETFs unrelated to the theme: VIXY, VXX, AGGH, CMBS, SQQQ, TVIX, SHV
- Bidirectional broad indexes placed in 'direct' (TLT, SPY, QQQ)
- Tickers already flagged "thematic_tool(≥3_themes)" — unless they are genuinely direct for THIS theme. If kept, place in 'observational', not 'direct'.
- Redundant tickers (same company multi-share-class)
- Low-conviction small caps without specific catalyst linkage

LANGUAGE RULES (rewrite each kept ticker):
- "beneficiary of X" → "historically sensitive to X" / "correlated with X"
- "pure play on X" → "direct exposure to X"
- "catalyst: X" → "observable pattern: X" / "historical driver: X"
- "risk: X" → "reverse signal: X" / "historical underperformance window: X"
- Strong claim → hedged framing with historical anchor
- No "will", "should", "expect" — use "may", "has historically", "tends to"
- Keep under 140 chars per field.

CATEGORY GUIDANCE:
- direct    → the company's core business IS the theme (e.g., MP for rare earths)
- observational → the ticker has shown historical correlation, but is not a pure bet
- pressure  → theme creates cost / demand / competitive pressure on this name

CONFIDENCE BAND:
- high   → multiple independent signals align; clear exposure
- medium → single-signal, plausible framework, needs confirmation
- low    → speculative / peripheral / derivative linkage

===

OUTPUT (valid JSON only, no markdown):

{
  "refined_recommendations": [
    {
      "ticker_symbol": "TICKER",
      "exposure_type": "direct|observational|pressure",
      "confidence_band": "high|medium|low",
      "role_reasoning": "rewritten in framework language, ≤140 chars",
      "role_reasoning_zh": "中文, ≤140 chars",
      "business_exposure": "rewritten, ≤120 chars",
      "business_exposure_zh": "中文, ≤120 chars",
      "catalyst": "observable pattern, ≤100 chars, or null",
      "catalyst_zh": "中文 or null",
      "risk": "reverse signal, ≤100 chars, or null",
      "risk_zh": "中文 or null",
      "notes": "why kept / main language change"
    }
  ],
  "removed_from_existing": [
    { "ticker": "X", "reason": "tool_etf | redundant | bidirectional | thematic_tool | low_conviction | other_reason" }
  ],
  "refinement_summary": "2 sentences on the overall changes. English only."
}

Max 12 kept total. If 8 meet the bar, return 8. Quality > Quantity.
Return ONLY valid JSON, no markdown.`
}

function lenientParse(text: string): RefineOutput {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const full = cleaned.match(/\{[\s\S]*\}/)
  if (full) {
    try {
      return JSON.parse(full[0]) as RefineOutput
    } catch {
      // fall through to recovery
    }
  }
  // Recovery: parse refined_recommendations array object-by-object.
  const recsStart = cleaned.indexOf('"refined_recommendations"')
  const arrStart = recsStart >= 0 ? cleaned.indexOf('[', recsStart) : -1
  const refined: unknown[] = []
  if (arrStart >= 0) {
    let i = arrStart + 1
    while (i < cleaned.length) {
      while (i < cleaned.length && /\s|,/.test(cleaned[i])) i++
      if (cleaned[i] !== '{') break
      const start = i
      let depth = 0
      let inString = false
      let escape = false
      for (; i < cleaned.length; i++) {
        const c = cleaned[i]
        if (escape) { escape = false; continue }
        if (c === '\\') { escape = true; continue }
        if (c === '"') { inString = !inString; continue }
        if (inString) continue
        if (c === '{') depth++
        else if (c === '}') { depth--; if (depth === 0) { i++; break } }
      }
      if (depth !== 0) break
      try { refined.push(JSON.parse(cleaned.slice(start, i))) } catch { break }
    }
  }
  const summaryMatch = cleaned.match(/"refinement_summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  return {
    refined_recommendations: refined as RefinedRec[],
    removed_from_existing: [],
    refinement_summary: summaryMatch ? JSON.parse(`"${summaryMatch[1]}"`) : '',
  }
}

function tokenCost(input: number, output: number): number {
  return (input * 3 + output * 15) / 1_000_000
}

export async function callRefine(input: RefineInput): Promise<{ output: RefineOutput; stats: RefineStats }> {
  const prompt = buildPrompt(input)
  const started = Date.now()
  let text = ''
  let final
  try {
    const stream = anthropic.messages.stream({
      model: MODEL_SONNET,
      max_tokens: 5000,
      messages: [{ role: 'user', content: prompt }],
    })
    stream.on('text', (delta) => {
      text += delta
    })
    final = await stream.finalMessage()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        tags: { function: 'callRefine', file: 'lib/refine-recommendations.ts', model: MODEL_SONNET },
        extra: { theme_id: input.theme.id, theme_name: input.theme.name, recs_count: input.current_recs.length },
      })
    }
    throw error
  }
  const elapsed = (Date.now() - started) / 1000
  const output = lenientParse(text)
  const input_tokens = final.usage?.input_tokens ?? 0
  const output_tokens = final.usage?.output_tokens ?? 0
  return {
    output,
    stats: {
      input_tokens,
      output_tokens,
      cost_usd: tokenCost(input_tokens, output_tokens),
      elapsed_sec: elapsed,
      stop_reason: final.stop_reason ?? null,
    },
  }
}

export async function loadRefineInput(themeId: string): Promise<RefineInput | null> {
  const { data: theme } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, archetype_id')
    .eq('id', themeId)
    .maybeSingle()
  if (!theme) return null

  const { data: arch } = theme.archetype_id
    ? await supabaseAdmin
        .from('theme_archetypes')
        .select('category, playbook')
        .eq('id', theme.archetype_id)
        .maybeSingle()
    : { data: null }

  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select(
      'ticker_symbol, tier, exposure_direction, role_reasoning, role_reasoning_zh, ' +
        'business_exposure, business_exposure_zh, catalyst, catalyst_zh, risk, risk_zh, ' +
        'market_cap_band, is_pure_play, is_often_missed, is_thematic_tool, confidence, ' +
        'tickers(company_name)'
    )
    .eq('theme_id', themeId)

  type RawRec = CurrentRec & { tickers: { company_name?: string } | { company_name?: string }[] | null }

  const currentRecs: CurrentRec[] = ((recs ?? []) as unknown as RawRec[]).map((r) => {
    const t = Array.isArray(r.tickers) ? r.tickers[0] : r.tickers
    return {
      ticker_symbol: r.ticker_symbol,
      company_name: t?.company_name ?? r.ticker_symbol,
      tier: r.tier,
      exposure_direction: r.exposure_direction,
      role_reasoning: r.role_reasoning,
      role_reasoning_zh: r.role_reasoning_zh,
      business_exposure: r.business_exposure,
      business_exposure_zh: r.business_exposure_zh,
      catalyst: r.catalyst,
      catalyst_zh: r.catalyst_zh,
      risk: r.risk,
      risk_zh: r.risk_zh,
      market_cap_band: r.market_cap_band,
      is_pure_play: r.is_pure_play,
      is_often_missed: r.is_often_missed,
      is_thematic_tool: r.is_thematic_tool,
      confidence: r.confidence,
    }
  })

  return {
    theme: { id: theme.id, name: theme.name, summary: theme.summary },
    archetype: arch
      ? {
          category: (arch as { category?: string }).category ?? null,
          playbook: (arch as { playbook?: Record<string, unknown> }).playbook ?? null,
        }
      : null,
    current_recs: currentRecs,
  }
}

export async function applyRefinement(
  themeId: string,
  input: RefineInput,
  output: RefineOutput
): Promise<{ updated: number; explicit_removed: number; implicit_removed: number; implicit_removed_tickers: string[] }> {
  const originalSymbols = new Set(
    input.current_recs.map((r) => r.ticker_symbol.toUpperCase())
  )
  const keptSymbols = new Set(
    output.refined_recommendations.map((r) => r.ticker_symbol.toUpperCase())
  )
  const explicitRemovedSymbols = new Set(
    output.removed_from_existing.map((r) => r.ticker.toUpperCase())
  )

  // Anything in original but not kept = remove. Merge explicit + implicit.
  const toDelete = Array.from(originalSymbols).filter((s) => !keptSymbols.has(s))
  const implicitRemoved = toDelete.filter((s) => !explicitRemovedSymbols.has(s))

  let totalRemoved = 0
  if (toDelete.length > 0) {
    const { error, count } = await supabaseAdmin
      .from('theme_recommendations')
      .delete({ count: 'exact' })
      .eq('theme_id', themeId)
      .in('ticker_symbol', toDelete)
    if (error) throw new Error(`delete: ${error.message}`)
    totalRemoved = count ?? 0
  }

  let updated = 0
  for (const r of output.refined_recommendations) {
    const { error, count } = await supabaseAdmin
      .from('theme_recommendations')
      .update(
        {
          exposure_type: r.exposure_type,
          confidence_band: r.confidence_band,
          role_reasoning: r.role_reasoning,
          role_reasoning_zh: r.role_reasoning_zh,
          business_exposure: r.business_exposure,
          business_exposure_zh: r.business_exposure_zh,
          catalyst: r.catalyst,
          catalyst_zh: r.catalyst_zh,
          risk: r.risk,
          risk_zh: r.risk_zh,
        },
        { count: 'exact' }
      )
      .eq('theme_id', themeId)
      .eq('ticker_symbol', r.ticker_symbol.toUpperCase())
    if (error) throw new Error(`update ${r.ticker_symbol}: ${error.message}`)
    updated += count ?? 0
  }

  return {
    updated,
    explicit_removed: totalRemoved - implicitRemoved.length,
    implicit_removed: implicitRemoved.length,
    implicit_removed_tickers: implicitRemoved,
  }
}
