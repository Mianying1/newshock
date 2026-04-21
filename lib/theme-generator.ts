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
  step0_relevant?: 'yes' | 'no'
  step0_reason?: string
  step1_investable: 'yes' | 'no' | 'n/a'
  step1_reason: string
  step2_archetype_match: 'exact' | 'partial' | 'none' | 'n/a'
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
  why_exploratory_not_strengthen: string | null
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

Follow this decision process in order. Record your reasoning in decision_trace.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 0 — RELEVANCE FILTER (before all other steps)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before classification, decide if this news is market-relevant.

Mark RELEVANT if news could move stock prices in ANY sector:
- AI / semiconductors / data center / cloud
- Macroeconomic shifts (Fed, inflation, FX, VIX, credit)
- Geopolitical events (wars, tariffs, sanctions, China, Taiwan,
  Middle East, elections with market impact)
- Supply chain disruptions
- Industrial policy / onshoring / energy transition
- Regulatory decisions (FDA, FTC, SEC, FAA, BIS, CFIUS)
- Commodity shocks (oil, gas, rare earth, copper, power, agricultural)
- Agriculture / fertilizer / food supply
- Pharma / biotech / GLP-1 / clinical trials / drug approvals
- Defense / aerospace / military contracts
- EV / battery / lithium / automotive
- Crypto / stablecoins / BTC ETF / digital assets regulation
- Consumer shifts / retail / restaurant / travel / housing
- Corporate catalysts (major M&A, strategic investments)
- Single-company catalysts (large company or sector ripple effect)

Mark IRRELEVANT only if clearly:
- Pure politics / elections without direct market mechanism
- Sports / entertainment / celebrity / lifestyle
- Small-cap earnings with no sector read-across
- Routine corporate filings without financial substance
- Personnel changes below C-suite

Default: when unsure, mark RELEVANT and proceed to STEP 1.

IF IRRELEVANT → skip STEP 1-3 entirely. Return ONLY:
{
  "decision_trace": { "step0_relevant": "no", "step0_reason": "one sentence", "step1_investable": "n/a", "step1_reason": "", "step2_archetype_match": "n/a", "step2_archetype_id": null, "step3_existing_theme": "n/a", "step3_theme_id": null },
  "action": "irrelevant",
  "target_theme_id": null, "archetype_id": null, "theme_name": null, "theme_summary": null,
  "classification_confidence": 0,
  "suggested_tickers": { "tier1": [], "tier2": [], "tier3": [] },
  "ticker_reasoning": {},
  "reasoning": "not market-relevant",
  "why_exploratory_not_strengthen": null
}

IF RELEVANT → set step0_relevant = "yes" and proceed to STEP 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — INVESTABLE RELEVANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A news event is INVESTABLE if ANY of these are true:
- Can plausibly move the stock price of at least 1 company by 3%+ in the next week
- Creates a new narrative that could emerge as a theme
- Is a measurable catalyst with concrete dollar amounts, dates, or parties
- Changes the competitive positioning or supply chain of a sector

A news event is NOT INVESTABLE if:
- Purely political commentary without market mechanism
- Pre-announced / widely expected events (routine calendar items)
- Personnel changes below C-suite
- Minor corporate filings (10-Q routine updates, small dividend adjustments)
- Entertainment, sports, lifestyle

Default: when unsure, lean INVESTABLE. False positives go to exploratory (low cost); false negatives lose a theme opportunity (high cost).

If Step 1 = NOT INVESTABLE → action = "irrelevant". STOP.

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
WHEN TO FORCE NEW_EXPLORATORY (critical)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST choose action = "new_exploratory" when:
1. The news is clearly investable (passed Step 1)
2. But NO archetype matches with confidence >= 60
3. Do NOT force-fit into partially-matching archetypes
4. Do NOT choose strengthen_existing just because an active theme is tangentially related

Examples of when exploratory is REQUIRED:

- News: "Mosaic opens new potash facility in Saskatchewan"
  - No archetype matches (no agriculture archetype exists)
  - Action: new_exploratory, theme_name: "Fertilizer Capacity Expansion · Potash Supply", suggested tickers: MOS/NTR/CF
  - Do NOT: strengthen "onshoring_industrial_policy" (too tangential)

- News: "Eli Lilly Phase 3 trial shows 25% weight loss for Zepbound in adolescents"
  - No archetype matches (no obesity/GLP-1 archetype)
  - Action: new_exploratory, theme_name: "GLP-1 Pediatric Indication Expansion", suggested tickers: LLY/NVO
  - Do NOT: mark irrelevant

- News: "Lockheed Martin wins $2.8B Poland air defense contract"
  - No archetype matches (no defense archetype)
  - Action: new_exploratory, theme_name: "NATO Frontier Defense Buildup", suggested tickers: LMT/RTX/NOC
  - Do NOT: strengthen geopolitical themes generically

Rationale: The system's long-term value depends on discovering new themes outside preset archetypes. Exploratory is CHEAP to create and gets reviewed weekly. Forcing events into wrong archetypes pollutes existing themes.

Bias: When archetype confidence is 55-70, prefer new_exploratory over strengthen_existing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THEME NAMING RULES (mandatory)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Theme names MUST be in English only.
   ❌ "AI 数据中心全光互联 · 5 年转型预期"
   ✅ "AI Data Center Optical Interconnect · 5-Year Transition"

2. Theme names MUST align with the matched archetype.
   Do NOT add unrelated prefixes even if the triggering news mentions them.
   ❌ "Iran Conflict · Fertilizer Supply Disruption"
      (fertilizer supply archetype — do not add Iran prefix)
   ✅ "Fertilizer Supply Disruption · Global Agri-Commodity"

3. Use the format: "[Main Concept] · [Specific Angle]"
   - Main Concept: The core theme (matches archetype)
   - Specific Angle: What makes this instance unique (max 30 chars)
   - Total length: max 60 characters

4. If an event involves multiple distinct causal chains, prefer SPLIT
   (use THEME SPLIT RULE below) over compound naming.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THEME SPLIT RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If a single news event involves multiple distinct causal chains
(different drivers, time horizons, exposure baskets), DO NOT
merge them into one theme.

Examples of mis-merging:
❌ "AI Data Center Power · Semiconductor Efficiency"
   = mixes compute + cooling + power supply + grid + chips

Should split into separate themes:
✅ "AI Compute Demand Surge" (NVDA, AMD, AVGO)
✅ "Datacenter Liquid Cooling" (VRT, SMCI)
✅ "Datacenter Power Supply" (CEG, VST)
✅ "Grid Infrastructure Buildout" (ETN, ENTG)

Split criteria — if ANY apply, split:
- Different primary catalysts
- Different time horizons (quarterly vs multi-year)
- Different exposure baskets (no ticker overlap)
- Different archetypes apply

When in doubt: SPLIT. Multiple narrow themes > one broad theme.
For a split: create the primary theme now; note the secondary
themes in theme_summary for human review.

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
EXPOSURE MAPPING (for new_from_archetype and new_exploratory)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
List exposure mapping (direct/indirect/peripheral).
Start with archetype.typical_tickers as baseline.
ENHANCE with 1-3 situational tickers specific to this event.
For [DYNAMIC] archetypes: build all tiers from situational analysis.

Tier definitions:
- Tier 1 (Direct Exposure): Companies whose revenue/profit is most directly
  driven by this theme. Primary causal link, near-term impact.
- Tier 2 (Indirect Exposure): Companies with secondary exposure through
  supply chain, adjacent market, or downstream demand effects.
- Tier 3 (Peripheral Exposure): Companies with observable but limited
  connection — different time horizon or partial revenue dependency.

TICKER SELECTION POLICY:

Primary: Prefer tickers from the TICKERS DATABASE provided.
These are vetted tickers with known metadata.

Secondary (discovery): If the DATABASE lacks obvious beneficiary tickers
for this theme, you MAY suggest tickers outside the database. These are
exploratory suggestions and will be logged for weekly review.

Rules for out-of-DB suggestions:
- Must be a real, actively-traded US-listed ticker (NYSE or NASDAQ)
- Must be a ticker you are highly confident exists (not fabricated)
- Mark them in ticker_reasoning with a [OUT_OF_DB] prefix
  Example: "NTR": "[OUT_OF_DB] Nutrien is world's largest potash producer,
  direct beneficiary of fertilizer supply tightening"
- Do NOT suggest delisted / bankrupt / OTC pink sheet tickers
- Do NOT suggest foreign listings without US ADR
- When in doubt about whether a ticker exists, omit it

Rule of thumb: DB-first. Only use out-of-DB when the theme is clearly in
a sector the DB doesn't cover (e.g., satellite IoT, specialty REITs, etc.).

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

theme_name format: "Main Concept · Specific Angle" (concise, max 60 chars, English only)
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

Mark as RELEVANT if the news could move stock prices in ANY sector. Broad inclusion — when in doubt, mark relevant. Specifically include:

- AI / semiconductors / data center / cloud infrastructure
- Macroeconomic shifts (Fed, inflation, FX, VIX, credit, yield curve)
- Geopolitical events (wars, tariffs, sanctions, China, Taiwan, Middle East, elections with market impact)
- Supply chain disruptions (shipping, fab, critical components, ports, logistics)
- Industrial policy / onshoring / reshoring / energy transition / grid
- Regulatory decisions (FDA, FTC, SEC, FAA, BIS, CFIUS)
- Commodity shocks (oil, gas, rare earth, copper, power, agricultural)

- 【扩展】Agriculture / fertilizer / food supply (wheat, corn, potash, phosphate)
- 【扩展】Pharma / biotech / GLP-1 / clinical trials / drug approvals
- 【扩展】Defense / aerospace / military contracts / weapons systems
- 【扩展】EV / battery / lithium / automotive supply chain
- 【扩展】Crypto / stablecoins / BTC ETF / digital assets regulation
- 【扩展】Consumer shifts / retail / restaurant / travel / housing

- Corporate catalysts (major M&A, strategic investments, partnerships, restructuring, turnarounds)
- Single-company catalysts if the company is large enough to move sector ETFs or has supply chain ripple effects

Mark as IRRELEVANT only if clearly:
- Pure politics / elections without direct market mechanism
- Sports / entertainment / celebrity / lifestyle
- Small-cap earnings with no sector read-across (under $500M market cap solo news)
- Internal corporate news (personnel below C-suite, office moves, routine filings without financial substance)

Default: when unsure, mark RELEVANT and let downstream analysis decide.

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
    `    "step0_relevant": "yes" | "no",\n` +
    `    "step0_reason": "one sentence",\n` +
    `    "step1_investable": "yes" | "no" | "n/a",\n` +
    `    "step1_reason": "one phrase",\n` +
    `    "step2_archetype_match": "exact" | "partial" | "none" | "n/a",\n` +
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
    `  "reasoning": "one sentence why this action",\n` +
    `  "why_exploratory_not_strengthen": "If action is strengthen_existing but archetype match was partial, explain why not exploratory. Otherwise null."\n` +
    `}`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1500,
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
        step0_relevant: 'yes',
        step0_reason: '',
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
      why_exploratory_not_strengthen: json.why_exploratory_not_strengthen ?? null,
    }
  } catch {
    return {
      decision_trace: {
        step0_relevant: 'yes' as const,
        step0_reason: 'parse error',
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
      why_exploratory_not_strengthen: null,
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

// ─── Ticker candidate logging ─────────────────────────────────────────────────

async function logTickerCandidate(
  symbol: string,
  context: {
    event_id: string
    theme_id: string
    suggested_tier: number
    role_reasoning: string
    confidence: number
    is_out_of_db?: boolean
  }
): Promise<void> {
  const cleanSymbol = symbol.toUpperCase().trim()
  const { data: existing } = await supabaseAdmin
    .from('ticker_candidates')
    .select('id, mention_count, contexts')
    .eq('symbol', cleanSymbol)
    .maybeSingle()

  // Strip [OUT_OF_DB] prefix from stored reasoning
  const cleanedReasoning = context.role_reasoning.replace(/^\[OUT_OF_DB\]\s*/i, '')
  const newContext = {
    ...context,
    role_reasoning: cleanedReasoning,
    suggested_at: new Date().toISOString(),
  }

  if (existing) {
    await supabaseAdmin
      .from('ticker_candidates')
      .update({
        mention_count: (existing.mention_count ?? 0) + 1,
        contexts: [...((existing.contexts as unknown[]) ?? []), newContext],
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin
      .from('ticker_candidates')
      .insert({ symbol: cleanSymbol, contexts: [newContext] })
  }
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
  const skippedRows = uniqueProposed.filter((x) => !validSet.has(x.symbol))

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

  // Log unknown tickers to candidates table for human review
  for (const { symbol, tier } of skippedRows) {
    const rawReasoning = sonnet.ticker_reasoning[symbol] ?? ''
    const isOutOfDb = /^\[OUT_OF_DB\]/i.test(rawReasoning)
    await logTickerCandidate(symbol, {
      event_id: eventId,
      theme_id: themeId,
      suggested_tier: tier,
      role_reasoning: rawReasoning,
      confidence: sonnet.classification_confidence,
      is_out_of_db: isOutOfDb,
    })
  }

  const skipped = skippedRows.map((x) => x.symbol)
  const reasoningNote =
    skipped.length > 0
      ? `${sonnet.reasoning} | novel tickers logged: ${skipped.join(', ')}`
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

  try {
    // Single Sonnet call — STEP 0 relevance filter is embedded in the prompt
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

  // Single-stage Sonnet — STEP 0 relevance filter merged into Sonnet prompt
  // Concurrency 3 to respect Sonnet rate limits
  const sonnetLimiter = pLimit(rate_limit)
  const sonnetResults = await Promise.all(
    events.map((event) =>
      sonnetLimiter(async () => {
        if (isSecFiling(event)) {
          return { event: event as EventRow, sonnet: null, secDeferred: true }
        }
        const sonnet = await sonnetIdentifyTheme(event as EventRow)
        const dt = sonnet.decision_trace
        const s0 = dt.step0_relevant ?? 'yes'
        console.log(`[sonnet] ${event.id.slice(0, 8)} → ${sonnet.action} (conf=${sonnet.classification_confidence}) s0=${s0} s1=${dt.step1_investable} s2=${dt.step2_archetype_match} s3=${dt.step3_existing_theme}`)
        return { event: event as EventRow, sonnet, secDeferred: false }
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

  for (const { event, sonnet, secDeferred } of sonnetResults) {
    if (secDeferred || !sonnet) {
      await supabaseAdmin
        .from('events')
        .update({ classifier_reasoning: SEC_DEFER_REASONING })
        .eq('id', event.id)
      continue
    }
    try {
      if (sonnet.action === 'irrelevant') {
        console.log(`  [IRRELEVANT] "${event.headline.slice(0, 60)}" reason="${sonnet.reasoning.slice(0, 80)}"`)
        await supabaseAdmin
          .from('events')
          .update({ trigger_theme_id: null, classifier_reasoning: `[irrelevant] ${sonnet.reasoning}` })
          .eq('id', event.id)
        counts.irrelevant++

      } else if (sonnet.action === 'strengthen_existing' && sonnet.target_theme_id) {
        const ctx = await getMatcherContext()
        const matchedTheme = ctx.activeThemes.find((t) => t.id === sonnet.target_theme_id)
        console.log(`  [STRENGTHEN] "${event.headline.slice(0, 60)}" → "${matchedTheme?.name ?? sonnet.target_theme_id}"`)
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
          console.log(`  [NEW_ARCHETYPE] "${event.headline.slice(0, 60)}" → archetype="${sonnet.archetype_id}"`)
          const { theme_id, tickers_created } = await handleNewTheme(event.id, sonnet, false)
          batchArchetypeThemeMap[archetypeKey] = theme_id
          counts.themes_created++
          counts.recommendations_created += tickers_created
          counts.new_from_archetype++
        }

      } else if (sonnet.action === 'new_exploratory') {
        console.log(`  [NEW_EXPLORATORY] "${event.headline.slice(0, 60)}" → theme="${sonnet.theme_name}"`)
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

  const sonnetCallCount = events.length
  const cost_estimate_usd =
    Math.round(sonnetCallCount * COST_SONNET_CACHE_HIT * 10000) / 10000

  return {
    processed: events.length,
    strengthen_existing: counts.strengthen_existing,
    new_from_archetype: counts.new_from_archetype,
    new_exploratory: counts.new_exploratory,
    irrelevant: counts.irrelevant,
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
