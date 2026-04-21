import pLimit from 'p-limit'
import { anthropic, MODEL_HAIKU, MODEL_SONNET } from './anthropic'
import { supabaseAdmin } from './supabase-admin'
import { isSecFiling, SEC_DEFER_REASONING } from './sec-filter'
import { getMatcherContext, invalidateMatcherCache } from './theme-matcher'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventRow {
  id: string
  headline: string
  raw_content: string | null
  source_name: string | null
  event_date: string | null
  mentioned_tickers: string[] | null
}

type ThemeAction = 'strengthen_existing' | 'new_from_archetype' | 'new_exploratory' | 'irrelevant' | 'deferred_sec' | 'error'

interface DecisionTrace {
  step1_investable: 'yes' | 'no'
  step1_reason: string
  step2_archetype_match: 'exact' | 'partial' | 'none'
  step2_archetype_id: string | null
  step3_existing_theme: 'found' | 'not_found' | 'n/a'
  step3_theme_id: string | null
}

interface SonnetThemeResult {
  decision_trace: DecisionTrace
  action: 'strengthen_existing' | 'new_from_archetype' | 'new_exploratory' | 'irrelevant'
  target_theme_id: string | null
  archetype_id: string | null
  theme_name: string | null
  theme_summary: string | null
  classification_confidence: number
  suggested_tickers: { tier1: string[]; tier2: string[]; tier3: string[] }
  ticker_reasoning: Record<string, string>
  reasoning: string
}

interface GenerationResult {
  event_id: string
  action: ThemeAction
  theme_id?: string
  archetype_id?: string | null
  theme_name?: string | null
  reasoning: string
  confidence: number
  tickers_created: number
  novel_tickers_skipped: string[]
}

export interface GenerateSummary {
  processed: number
  strengthen_existing: number
  new_from_archetype: number
  new_exploratory: number
  irrelevant: number
  deferred_sec: number
  errors: number
  themes_created: number
  recommendations_created: number
  active_themes_after: number
  cost_estimate_usd: number
  duration_ms: number
  exploratory_details: Array<{
    theme_name: string
    summary: string | null
    confidence: number
    reasoning: string
  }>
}

// ─── Prompt constants ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Theme Identification engine for Newshock, a thematic investing intelligence tool.

Follow this 3-step decision process in order. Record your reasoning in decision_trace.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — INVESTABLE RELEVANCE (be PERMISSIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask: "Could this news move stock prices for at least 2 companies?"

YES — anything touching: geopolitics, macro policy (Fed/rates/inflation/dollar),
technology breakthroughs, supply chain disruptions, regulatory decisions (FDA/FTC/SEC),
earnings inflections, commodity demand, M&A, industrial policy, corporate strategy shifts,
export controls, energy, semiconductors, AI infrastructure.

NO (only mark irrelevant here if clearly) — pure political gossip with zero market angle,
entertainment, sports, non-C-suite personnel changes, lifestyle/health articles,
routine company press releases with no financial significance.

If Step 1 = NO → action = "irrelevant". STOP.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — ARCHETYPE MATCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Check the 20 provided ARCHETYPES. Use trigger_keywords as matching signal.
Apply exclusion_rules strictly — any exclusion hit = reject that archetype.
Result: "exact" (clear keyword + context match), "partial" (related but imperfect), "none".

If Step 2 = "none" → action = "new_exploratory". MANDATORY. Do NOT fall back to irrelevant.
  Exploratory themes are reviewed by humans — false positives here are acceptable.
  Write a theme_name and theme_summary. Suggest tickers from the TICKERS DATABASE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — EXISTING THEME CONSOLIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If Step 2 found a match, check ACTIVE_THEMES for an existing theme.
Use strengthen_existing if ALL hold:
  ✓ An active theme has the SAME archetype_id as your match
  ✓ Its last_active_at is within 14 days of this news
  ✓ This news is about the SAME ongoing situation (same country/entity/event chain)
  ✓ News adds new information (not a duplicate)

STRENGTHEN examples:
  • 3rd US chip-export update → existing "US AI Chip Export" theme (same archetype, same policy)
  • 2nd Iran escalation report → existing "Iran Crisis" theme (same conflict)
DO NOT strengthen:
  • Same archetype but different country or entity (Iran tension ≠ Russia sanctions)
  • News from a different archetype's perspective

If strengthen conditions met → action = "strengthen_existing", set target_theme_id.
Otherwise → action = "new_from_archetype".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIER ASSIGNMENT (for new_from_archetype and new_exploratory)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Start with archetype.typical_tickers as baseline.
ENHANCE with 1-3 situational tickers from TICKERS DATABASE specific to this event.
For [DYNAMIC] archetypes: build all tiers from situational analysis using TICKERS DATABASE.
ONLY use tickers present in the provided TICKERS DATABASE list — no others.

MEGA CAP INVESTOR EXCLUSION RULE:
When the news describes a mega cap company (NVDA, AMD, INTC, AMZN, GOOGL, MSFT, META,
AAPL, TSLA, AVGO) MAKING an investment in another company, the mega cap investor
must NOT be placed in tier 1 or tier 2 of the recommendations.

Reasoning: The mega cap's own stock impact from making an investment is negligible and
already priced in. The real opportunity is in the investee ecosystem.

Instead look for:
  • The investee company (if listed) → tier 1
  • Listed competitors of the investee (category beneficiaries) → tier 1/2
  • Upstream suppliers / foundries benefiting from the investment theme → tier 2
  • The mega cap investor → tier 3 ONLY if they have separate direct revenue exposure

EXAMPLE:
  News: "AMD invests $200M in EdgeCortix for AI edge chips"
  WRONG: tier1=[AMD, NVDA]   ← AMD is the investor; NVDA is unrelated association
  RIGHT: tier1=[GFS] (foundry for edge chips), tier2=[TSEM,AXTI], tier3=[AMD] (optional)

Do NOT add NVDA or other mega caps just because they're in the same broad sector.

FEW-SHOT EXAMPLES for tier 3 "direct exposure" test:

ALLOW in tier 3:
  News: "Apple announces $5B investment in Globalstar for satellite services"
  Apple has $30B+ direct iPhone revenue exposure to satellite integration
  → tier3=[AAPL] ✓ (direct ongoing revenue dependency)

DO NOT ALLOW:
  News: "Google Ventures leads $200M Series D in startup XYZ"
  Pure venture investment, no Google P&L impact, no commercial relationship
  → tier3=[] (exclude GOOGL entirely)

THE TEST: Does the mega cap have material ongoing revenue flow tied to this investee?
If yes (supplier, customer, integration partner) → maybe tier 3.
If no (pure financial bet with no commercial dependency) → exclude entirely.

COMMERCIAL COUNTERPARTY EXCEPTION:
If the mega cap is SIMULTANEOUSLY a commercial counterparty (customer, supplier, or
compute/infrastructure provider) to the investee/transaction WITH material ongoing
revenue flow, re-include based on the COMMERCIAL relationship, not the investment.

  EXAMPLE 1 — Anthropic-Amazon $100B deal:
    AMZN provides AWS compute capacity to Anthropic ($100B contract)
    AMZN is BOTH investor AND commercial supplier with direct AWS revenue impact
    → Include AMZN in tier 1 based on AWS revenue impact ✓

  EXAMPLE 2 — MSFT-OpenAI (hypothetical):
    MSFT provides Azure compute to OpenAI + equity stake
    → Include MSFT in tier 1 based on Azure commercial relationship ✓

  EXAMPLE 3 — NVDA invests in EdgeCortix (DO NOT apply exception):
    NVDA's relationship is purely strategic/financial
    EdgeCortix does NOT generate material NVDA revenue
    → Maintain exclusion from tier 1 ✗

KEY DISTINCTION: Pure financial investment → exclude.
Investment + material commercial revenue flow → include based on commercial side.

theme_name format: "Situation · Beneficiary Category" (concise, max 60 chars, English or mix)
Return ONLY valid JSON. No markdown, no text outside JSON.`

// ─── Cost estimates (per-event) ───────────────────────────────────────────────
// Haiku: ~700 input + 100 output = ~$0.0006
// Sonnet cache miss: ~9k input + 500 output = ~$0.041
// Sonnet cache hit: ~8k cached + 700 uncached input + 500 output = ~$0.014
// Use cache-hit estimate after first call in a batch
const COST_HAIKU = 0.0006
const COST_SONNET_CACHE_MISS = 0.041
const COST_SONNET_CACHE_HIT = 0.014

// ─── Stage 1: Haiku pre-filter ────────────────────────────────────────────────

async function haikusFilter(
  headline: string,
  snippet: string
): Promise<{ relevant: boolean; reason: string }> {
  const prompt = `You are a financial news relevance filter for a thematic investing tool.

Mark as relevant if this news relates to ANY of:
- AI/semiconductors/data center infrastructure
- Macroeconomic shifts (Fed policy, inflation, dollar, VIX spikes, credit stress)
- Geopolitical events affecting markets (wars, tariffs, sanctions, China policy, Taiwan)
- Supply chain disruptions (shipping, fab outages, critical component shortages)
- Industrial policy / onshoring / energy transition
- Major regulatory decisions (FDA, FTC, SEC)
- Commodity demand shocks (oil, rare earth, copper, power)
- Corporate turnarounds with multi-quarter profitability inflection

Mark as irrelevant: pure politics with no market angle, sports, entertainment, lifestyle, earnings releases for small companies with no read-across.

Return JSON only: {"relevant": boolean, "reason": "one sentence"}

Headline: ${headline}
Snippet: ${snippet.slice(0, 500)}`

  const msg = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 120,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (msg.content[0] as { type: string; text: string }).text.trim()
  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    return { relevant: Boolean(json.relevant), reason: String(json.reason ?? '') }
  } catch {
    return { relevant: true, reason: 'parse error - treated as relevant' }
  }
}

// ─── Stage 2: Sonnet theme identification (with prompt caching) ───────────────

async function sonnetIdentifyTheme(event: EventRow): Promise<SonnetThemeResult> {
  const ctx = await getMatcherContext()

  const cachedContext =
    `ARCHETYPES (20 active):\n${ctx.archetypesText}\n\n` +
    `ACTIVE_THEMES (last 30 days):\n${ctx.activeThemesText}\n\n` +
    `TICKERS DATABASE (only use symbols from this list):\n${ctx.tickersText}`

  const mentionedTickers = (event.mentioned_tickers ?? []).join(', ') || '(none extracted)'
  const newsBlock =
    `NEWS:\n` +
    `Headline: ${event.headline}\n` +
    `Source: ${event.source_name ?? 'unknown'}\n` +
    `Published: ${event.event_date ?? 'unknown'}\n` +
    `Content: ${(event.raw_content ?? '').slice(0, 1500)}\n` +
    `Mentioned tickers (regex-extracted): ${mentionedTickers}\n\n` +
    `Return JSON matching this schema exactly:\n` +
    `{\n` +
    `  "decision_trace": {\n` +
    `    "step1_investable": "yes" | "no",\n` +
    `    "step1_reason": "one phrase",\n` +
    `    "step2_archetype_match": "exact" | "partial" | "none",\n` +
    `    "step2_archetype_id": string | null,\n` +
    `    "step3_existing_theme": "found" | "not_found" | "n/a",\n` +
    `    "step3_theme_id": uuid | null\n` +
    `  },\n` +
    `  "action": "strengthen_existing" | "new_from_archetype" | "new_exploratory" | "irrelevant",\n` +
    `  "target_theme_id": uuid | null,\n` +
    `  "archetype_id": string | null,\n` +
    `  "theme_name": string | null,\n` +
    `  "theme_summary": string | null,\n` +
    `  "classification_confidence": integer 0-100,\n` +
    `  "suggested_tickers": { "tier1": [], "tier2": [], "tier3": [] },\n` +
    `  "ticker_reasoning": { "TICKER": "causal role one-liner" },\n` +
    `  "reasoning": "one sentence why this action"\n` +
    `}`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 800,
    temperature: 0,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: cachedContext,
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: newsBlock },
        ],
      },
    ],
  })

  const text = (msg.content[0] as { type: string; text: string }).text.trim()
  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim()) as SonnetThemeResult
    return {
      decision_trace: json.decision_trace ?? {
        step1_investable: 'yes',
        step1_reason: '',
        step2_archetype_match: 'none',
        step2_archetype_id: null,
        step3_existing_theme: 'n/a',
        step3_theme_id: null,
      },
      action: json.action ?? 'irrelevant',
      target_theme_id: json.target_theme_id ?? null,
      archetype_id: json.archetype_id ?? null,
      theme_name: json.theme_name ?? null,
      theme_summary: json.theme_summary ?? null,
      classification_confidence: typeof json.classification_confidence === 'number' ? json.classification_confidence : 50,
      suggested_tickers: {
        tier1: Array.isArray(json.suggested_tickers?.tier1) ? json.suggested_tickers.tier1 : [],
        tier2: Array.isArray(json.suggested_tickers?.tier2) ? json.suggested_tickers.tier2 : [],
        tier3: Array.isArray(json.suggested_tickers?.tier3) ? json.suggested_tickers.tier3 : [],
      },
      ticker_reasoning: typeof json.ticker_reasoning === 'object' ? json.ticker_reasoning : {},
      reasoning: String(json.reasoning ?? ''),
    }
  } catch {
    return {
      decision_trace: {
        step1_investable: 'yes' as const,
        step1_reason: 'parse error',
        step2_archetype_match: 'none' as const,
        step2_archetype_id: null,
        step3_existing_theme: 'n/a' as const,
        step3_theme_id: null,
      },
      action: 'irrelevant',
      target_theme_id: null,
      archetype_id: null,
      theme_name: null,
      theme_summary: null,
      classification_confidence: 0,
      suggested_tickers: { tier1: [], tier2: [], tier3: [] },
      ticker_reasoning: {},
      reasoning: 'json parse error',
    }
  }
}

// ─── Ticker validation ────────────────────────────────────────────────────────

async function getValidTickers(symbols: string[]): Promise<Set<string>> {
  if (symbols.length === 0) return new Set()
  const { data } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .in('symbol', symbols)
  return new Set<string>((data ?? []).map((r: { symbol: string }) => r.symbol))
}

// ─── Ticker merging ───────────────────────────────────────────────────────────

function mergeTickers(
  archetypeTickers: { tier1?: string[]; tier2?: string[]; tier3?: string[]; dynamic?: boolean } | null,
  suggested: { tier1: string[]; tier2: string[]; tier3: string[] }
): { tier1: string[]; tier2: string[]; tier3: string[] } {
  if (archetypeTickers?.dynamic) {
    return suggested
  }
  const merge = (arch: string[] = [], sugg: string[] = []) =>
    Array.from(new Set([...arch, ...sugg]))
  return {
    tier1: merge(archetypeTickers?.tier1, suggested.tier1),
    tier2: merge(archetypeTickers?.tier2, suggested.tier2),
    tier3: merge(archetypeTickers?.tier3, suggested.tier3),
  }
}

// ─── DB operations ────────────────────────────────────────────────────────────

async function handleStrengthenExisting(
  eventId: string,
  themeId: string,
  reasoning: string
): Promise<{ tickers_created: number; novel_tickers_skipped: string[] }> {
  await supabaseAdmin
    .from('themes')
    .update({
      event_count: supabaseAdmin.rpc as unknown as never, // handled below via raw increment
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', themeId)

  // Use RPC-style increment via raw SQL workaround: read then write
  const { data: existing } = await supabaseAdmin
    .from('themes')
    .select('event_count, theme_strength_score')
    .eq('id', themeId)
    .single()

  if (existing) {
    await supabaseAdmin
      .from('themes')
      .update({
        event_count: (existing.event_count ?? 0) + 1,
        theme_strength_score: Math.min(100, (existing.theme_strength_score ?? 50) + 2),
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', themeId)
  }

  await supabaseAdmin
    .from('events')
    .update({ trigger_theme_id: themeId, classifier_reasoning: reasoning })
    .eq('id', eventId)

  return { tickers_created: 0, novel_tickers_skipped: [] }
}

async function handleNewTheme(
  eventId: string,
  sonnet: SonnetThemeResult,
  isExploratory: boolean
): Promise<{ theme_id: string; tickers_created: number; novel_tickers_skipped: string[] }> {
  const ctx = await getMatcherContext()

  let mergedTickers: { tier1: string[]; tier2: string[]; tier3: string[] }
  let archetypeTypicalTickers: { tier1?: string[]; tier2?: string[]; tier3?: string[]; dynamic?: boolean } | null = null

  if (!isExploratory && sonnet.archetype_id) {
    const archetype = ctx.archetypes.find((a) => a.id === sonnet.archetype_id)
    archetypeTypicalTickers = archetype?.typical_tickers ?? null
  }

  mergedTickers = mergeTickers(archetypeTypicalTickers, sonnet.suggested_tickers)

  const allProposed = [
    ...mergedTickers.tier1.map((s) => ({ symbol: s, tier: 1 })),
    ...mergedTickers.tier2.map((s) => ({ symbol: s, tier: 2 })),
    ...mergedTickers.tier3.map((s) => ({ symbol: s, tier: 3 })),
  ]
  const uniqueProposed = allProposed.filter(
    (item, idx) => allProposed.findIndex((x) => x.symbol === item.symbol) === idx
  )

  const validSet = await getValidTickers(uniqueProposed.map((x) => x.symbol))
  const validRows = uniqueProposed.filter((x) => validSet.has(x.symbol))
  const skipped = uniqueProposed
    .filter((x) => !validSet.has(x.symbol))
    .map((x) => x.symbol)

  // Insert theme
  const { data: newTheme, error: themeErr } = await supabaseAdmin
    .from('themes')
    .insert({
      archetype_id: isExploratory ? null : (sonnet.archetype_id ?? null),
      name: sonnet.theme_name ?? 'Unnamed Theme',
      summary: sonnet.theme_summary,
      status: isExploratory ? 'exploratory_candidate' : 'active',
      institutional_awareness: isExploratory ? 'hidden' : 'early',
      theme_strength_score: isExploratory ? 40 : 55,
      classification_confidence: sonnet.classification_confidence,
      event_count: 1,
      first_seen_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (themeErr || !newTheme) {
    throw new Error(`theme insert failed: ${themeErr?.message}`)
  }

  const themeId = newTheme.id

  // Insert recommendations
  if (validRows.length > 0) {
    const recs = validRows.map(({ symbol, tier }) => ({
      theme_id: themeId,
      ticker_symbol: symbol,
      tier,
      role_reasoning: sonnet.ticker_reasoning[symbol] ?? null,
    }))

    const { error: recErr } = await supabaseAdmin
      .from('theme_recommendations')
      .insert(recs)

    if (recErr) {
      console.warn(`[theme-generator] theme_recommendations insert warning: ${recErr.message}`)
    }
  }

  // Log skipped tickers
  const reasoningNote =
    skipped.length > 0
      ? `${sonnet.reasoning} | novel tickers skipped: ${skipped.join(', ')}`
      : sonnet.reasoning

  await supabaseAdmin
    .from('events')
    .update({ trigger_theme_id: themeId, classifier_reasoning: reasoningNote })
    .eq('id', eventId)

  invalidateMatcherCache()

  return { theme_id: themeId, tickers_created: validRows.length, novel_tickers_skipped: skipped }
}

// ─── Per-event entry point ────────────────────────────────────────────────────

export async function generateTheme(event: EventRow): Promise<GenerationResult> {
  if (isSecFiling(event)) {
    await supabaseAdmin
      .from('events')
      .update({ classifier_reasoning: SEC_DEFER_REASONING })
      .eq('id', event.id)
    return {
      event_id: event.id,
      action: 'deferred_sec',
      reasoning: SEC_DEFER_REASONING,
      confidence: 0,
      tickers_created: 0,
      novel_tickers_skipped: [],
    }
  }

  const headline = event.headline
  const snippet = event.raw_content ?? ''

  try {
    // Stage 1: Haiku pre-filter
    const { relevant, reason } = await haikusFilter(headline, snippet)

    if (!relevant) {
      await supabaseAdmin
        .from('events')
        .update({ trigger_theme_id: null, classifier_reasoning: `[irrelevant] ${reason}` })
        .eq('id', event.id)
      return {
        event_id: event.id,
        action: 'irrelevant',
        reasoning: reason,
        confidence: 0,
        tickers_created: 0,
        novel_tickers_skipped: [],
      }
    }

    // Stage 2: Sonnet theme identification
    const sonnet = await sonnetIdentifyTheme(event)

    if (sonnet.action === 'irrelevant') {
      await supabaseAdmin
        .from('events')
        .update({ trigger_theme_id: null, classifier_reasoning: `[irrelevant] ${sonnet.reasoning}` })
        .eq('id', event.id)
      return {
        event_id: event.id,
        action: 'irrelevant',
        reasoning: sonnet.reasoning,
        confidence: sonnet.classification_confidence,
        tickers_created: 0,
        novel_tickers_skipped: [],
      }
    }

    if (sonnet.action === 'strengthen_existing' && sonnet.target_theme_id) {
      const { tickers_created, novel_tickers_skipped } = await handleStrengthenExisting(
        event.id,
        sonnet.target_theme_id,
        sonnet.reasoning
      )
      return {
        event_id: event.id,
        action: 'strengthen_existing',
        theme_id: sonnet.target_theme_id,
        reasoning: sonnet.reasoning,
        confidence: sonnet.classification_confidence,
        tickers_created,
        novel_tickers_skipped,
      }
    }

    if (sonnet.action === 'new_from_archetype' || sonnet.action === 'new_exploratory') {
      const isExploratory = sonnet.action === 'new_exploratory'
      const { theme_id, tickers_created, novel_tickers_skipped } = await handleNewTheme(
        event.id,
        sonnet,
        isExploratory
      )
      return {
        event_id: event.id,
        action: sonnet.action,
        theme_id,
        archetype_id: sonnet.archetype_id,
        theme_name: sonnet.theme_name,
        reasoning: sonnet.reasoning,
        confidence: sonnet.classification_confidence,
        tickers_created,
        novel_tickers_skipped,
      }
    }

    // Fallback — treat as irrelevant
    await supabaseAdmin
      .from('events')
      .update({ classifier_reasoning: `[fallback-irrelevant] ${sonnet.reasoning}` })
      .eq('id', event.id)
    return {
      event_id: event.id,
      action: 'irrelevant',
      reasoning: sonnet.reasoning,
      confidence: 0,
      tickers_created: 0,
      novel_tickers_skipped: [],
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[theme-generator] error for event ${event.id}: ${msg}`)
    await supabaseAdmin
      .from('events')
      .update({ classifier_reasoning: `[error] ${msg}` })
      .eq('id', event.id)
    return {
      event_id: event.id,
      action: 'error',
      reasoning: msg,
      confidence: 0,
      tickers_created: 0,
      novel_tickers_skipped: [],
    }
  }
}

// ─── Batch entry point ────────────────────────────────────────────────────────

export async function generateThemesForPendingEvents(options: {
  limit?: number
  rate_limit?: number
} = {}): Promise<GenerateSummary> {
  const { limit = 50, rate_limit = 5 } = options
  const start = Date.now()

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('id, headline, raw_content, source_name, event_date, mentioned_tickers')
    .is('trigger_theme_id', null)
    .is('classifier_reasoning', null)
    .neq('source_name', 'SEC EDGAR 8-K Filings')
    .order('event_date', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch pending events: ${error.message}`)
  if (!events || events.length === 0) {
    return {
      processed: 0,
      strengthen_existing: 0,
      new_from_archetype: 0,
      new_exploratory: 0,
      irrelevant: 0,
      deferred_sec: 0,
      errors: 0,
      themes_created: 0,
      recommendations_created: 0,
      active_themes_after: 0,
      cost_estimate_usd: 0,
      duration_ms: 0,
      exploratory_details: [],
    }
  }

  console.log(`[theme-generator] Processing ${events.length} pending events (rate_limit=${rate_limit})`)

  // Stage 1: Haiku filter — concurrency 10
  const haikuLimiter = pLimit(10)
  const haikuResults = await Promise.all(
    events.map((event) =>
      haikuLimiter(async () => {
        if (isSecFiling(event)) return { event, relevant: false, reason: 'SEC filing' }
        const { relevant, reason } = await haikusFilter(
          event.headline,
          event.raw_content ?? ''
        )
        console.log(`[haiku] ${event.id.slice(0, 8)} → ${relevant ? 'relevant' : 'irrelevant'}: ${reason.slice(0, 60)}`)
        return { event, relevant, reason }
      })
    )
  )

  // Mark irrelevant events in DB (batch)
  const irrelevantEvents = haikuResults.filter((r) => !r.relevant)
  for (const { event, reason } of irrelevantEvents) {
    await supabaseAdmin
      .from('events')
      .update({ trigger_theme_id: null, classifier_reasoning: `[irrelevant] ${reason}` })
      .eq('id', event.id)
  }

  // Stage 2: Sonnet — only relevant events, concurrency 3
  const relevantEvents = haikuResults.filter((r) => r.relevant)
  console.log(`[theme-generator] ${relevantEvents.length} events passed Haiku, running Sonnet...`)

  const sonnetLimiter = pLimit(3)
  const sonnetResults = await Promise.all(
    relevantEvents.map(({ event }) =>
      sonnetLimiter(async () => {
        const sonnet = await sonnetIdentifyTheme(event as EventRow)
        const dt = sonnet.decision_trace
        console.log(`[sonnet] ${event.id.slice(0, 8)} → ${sonnet.action} (conf=${sonnet.classification_confidence}) archetype=${sonnet.archetype_id ?? dt.step2_archetype_id ?? '-'} s1=${dt.step1_investable} s2=${dt.step2_archetype_match} s3=${dt.step3_existing_theme}`)
        return { event: event as EventRow, sonnet }
      })
    )
  )

  // Stage 3: DB operations — serial to avoid race conditions
  // batchArchetypeThemeMap: within-batch dedup — archetype_id → first theme_id created
  // When Sonnet calls ran in parallel they all saw an empty active-themes list, so
  // duplicate new_from_archetype results for the same archetype get redirected to strengthen.
  const batchArchetypeThemeMap: Record<string, string> = {}

  const counts = {
    strengthen_existing: 0,
    new_from_archetype: 0,
    new_exploratory: 0,
    irrelevant: 0,
    errors: 0,
    themes_created: 0,
    recommendations_created: 0,
  }
  const exploratoryDetails: GenerateSummary['exploratory_details'] = []

  for (const { event, sonnet } of sonnetResults) {
    try {
      if (sonnet.action === 'irrelevant') {
        await supabaseAdmin
          .from('events')
          .update({ trigger_theme_id: null, classifier_reasoning: `[irrelevant] ${sonnet.reasoning}` })
          .eq('id', event.id)
        counts.irrelevant++

      } else if (sonnet.action === 'strengthen_existing' && sonnet.target_theme_id) {
        await handleStrengthenExisting(event.id, sonnet.target_theme_id, sonnet.reasoning)
        counts.strengthen_existing++

      } else if (sonnet.action === 'new_from_archetype') {
        const archetypeKey = sonnet.archetype_id ?? '__no_archetype__'
        const existingBatchThemeId = batchArchetypeThemeMap[archetypeKey]

        if (existingBatchThemeId) {
          // Within-batch dedup: redirect to strengthen the already-created theme
          console.log(`[dedup] ${event.id.slice(0, 8)} → strengthen batch theme ${existingBatchThemeId} (archetype=${archetypeKey})`)
          await handleStrengthenExisting(event.id, existingBatchThemeId, `[batch-dedup] ${sonnet.reasoning}`)
          counts.strengthen_existing++
        } else {
          const { theme_id, tickers_created } = await handleNewTheme(event.id, sonnet, false)
          batchArchetypeThemeMap[archetypeKey] = theme_id
          counts.themes_created++
          counts.recommendations_created += tickers_created
          counts.new_from_archetype++
        }

      } else if (sonnet.action === 'new_exploratory') {
        const { tickers_created } = await handleNewTheme(event.id, sonnet, true)
        counts.themes_created++
        counts.recommendations_created += tickers_created
        counts.new_exploratory++
        exploratoryDetails.push({
          theme_name: sonnet.theme_name ?? '(unnamed)',
          summary: sonnet.theme_summary,
          confidence: sonnet.classification_confidence,
          reasoning: sonnet.reasoning,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[theme-generator] DB error for ${event.id}: ${msg}`)
      await supabaseAdmin
        .from('events')
        .update({ classifier_reasoning: `[error] ${msg}` })
        .eq('id', event.id)
      counts.errors++
    }
  }

  // Query active_themes_after
  const { count: activeThemesAfter } = await supabaseAdmin
    .from('themes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  const sonnetCallCount = relevantEvents.length
  const haikuOnlyCount = irrelevantEvents.length
  const cost_estimate_usd =
    Math.round(
      (sonnetCallCount * COST_SONNET_CACHE_HIT + haikuOnlyCount * COST_HAIKU) * 10000
    ) / 10000

  return {
    processed: events.length,
    strengthen_existing: counts.strengthen_existing,
    new_from_archetype: counts.new_from_archetype,
    new_exploratory: counts.new_exploratory,
    irrelevant: irrelevantEvents.length + counts.irrelevant,
    deferred_sec: 0,
    errors: counts.errors,
    themes_created: counts.themes_created,
    recommendations_created: counts.recommendations_created,
    active_themes_after: activeThemesAfter ?? 0,
    cost_estimate_usd,
    duration_ms: Date.now() - start,
    exploratory_details: exploratoryDetails,
  }
}
