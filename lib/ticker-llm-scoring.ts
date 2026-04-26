// Phase 2B.2 · LLM exposure scoring for retrieved tickers.
// Pass 1 (new): given a pre-filtered ticker list (from ticker-retrieval), ask the
// LLM to score exposure_pct + tier + direction + reasoning per ticker. The old
// pass — "invent tickers from theme description" — is being replaced.
import * as Sentry from '@sentry/nextjs'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'
import type { BucketWeight, RetrievedTicker } from '@/lib/ticker-retrieval'

export type ExposureDirection = 'benefits' | 'headwind' | 'mixed' | 'uncertain'
export type RetrievalSource = 'industry_retrieval' | 'llm_creative' | 'manual'

export interface ScoredTicker {
  ticker: string
  exposure_pct: number
  tier: 1 | 2 | 3
  exposure_direction: ExposureDirection
  reasoning: string
}

export interface ThemeContext {
  name: string
  summary: string
  archetype_name: string
  // Phase 3 R2 · injected from theme_archetypes so the LLM honors archetype scope.
  // Both optional for back-compat with older callers.
  exclusion_rules?: string[] | null
  expected_sectors?: string[] | null
}

export interface SamplingResult {
  evaluated: ScoredTicker[]
  sampled: { top: RetrievedTicker[]; mid: RetrievedTicker[]; tail: RetrievedTicker[] }
  cost_usd: number
  usage: { in: number; out: number; cache_read: number; cache_create: number }
}

// Pure function — exported so scorer changes (sub-task 4) can re-derive tier
// from the same rule. industry_retrieval rows pick tier from exposure_pct,
// llm_creative is always Tier 3 (LLM speculation, never elevated).
export function computeTier(exposure_pct: number, source: RetrievalSource): 1 | 2 | 3 {
  if (source === 'llm_creative') return 3
  if (exposure_pct >= 70) return 1
  if (exposure_pct >= 30) return 2
  return 3
}

// 3-layer stratified sample: top 30 (high-score core) + mid 31-100 (likely pure
// plays) + tail-from-rank-100+ (long tail safety net). Tail strategy is either
// pure random or bucket-aware (recommended) — bucket-aware guarantees minor
// archetype buckets (e.g. utilities/power for AI Capex) get coverage even if
// they cluster in rank 100+.
export interface SampleOptions {
  top?: number
  mid_to?: number
  // pure-random tail size (used when tail_strategy='random')
  tail_random?: number
  tail_strategy?: 'random' | 'bucket_aware'
  // bucket_aware: each archetype bucket must appear ≥ min_per_bucket times in
  // top+mid pool; if not, draw up to per_bucket_add tickers from tail that own
  // the bucket. Total tail capped at max_add.
  min_per_bucket?: number
  per_bucket_add?: number
  max_add?: number
  // Collapse dual-class shares (GOOG/GOOGL, BRK.A/BRK.B) before sampling so
  // they don't waste slots. Group by cik (keep max market_cap), then apply
  // hardcoded fallback for known cases when cik is missing.
  dedupe_dual_class?: boolean
  // Per-bucket guarantee: for each archetype bucket whose weight ≥ bucket_weight_threshold,
  // force the top-N tickers (by retrieval_score) into the eval set. Prevents well-known
  // mid-cap pure plays (HAL/SLB/BKR for oil services, VST/NRG for power) from being
  // pushed to rank 100+ and missed when bucket-aware tail rescue doesn't fire.
  archetype_buckets?: BucketWeight[]
  per_bucket_must_have?: number
  bucket_weight_threshold?: number
  // Hard cap on total eval set after composition. Trims tail/mid (never must_have)
  // if must_have + top + mid + tail exceeds this number.
  max_eval?: number
}

// Hardcoded fallback for tickers without cik. Each entry: aliases that should
// collapse to a single survivor.
const DUAL_CLASS_FALLBACK: Array<{ aliases: string[]; keep: string }> = [
  { aliases: ['GOOG', 'GOOGL'], keep: 'GOOGL' },
  { aliases: ['BRK.A', 'BRK-A', 'BRK.B', 'BRK-B'], keep: 'BRK-B' },
]

export function dedupeDualClass(rows: RetrievedTicker[]): RetrievedTicker[] {
  // Pass 1 — group by cik (when present), keep max market_cap per cik.
  const byCik = new Map<string, RetrievedTicker>()
  const noCik: RetrievedTicker[] = []
  for (const r of rows) {
    if (r.cik) {
      const prev = byCik.get(r.cik)
      if (!prev || (r.market_cap ?? 0) > (prev.market_cap ?? 0)) byCik.set(r.cik, r)
    } else {
      noCik.push(r)
    }
  }
  const survivors = [...byCik.values(), ...noCik]

  // Pass 2 — hardcoded fallback for known dual-class pairs that slipped through
  // (cik missing on one or both sides).
  const drop = new Set<string>()
  for (const { aliases, keep } of DUAL_CLASS_FALLBACK) {
    const present = survivors.filter(s => aliases.includes(s.ticker.toUpperCase()))
    if (present.length <= 1) continue
    for (const p of present) {
      if (p.ticker.toUpperCase() !== keep.toUpperCase()) drop.add(p.ticker.toUpperCase())
    }
  }
  const filtered = survivors.filter(s => !drop.has(s.ticker.toUpperCase()))

  // Preserve original ordering (caller already sorted by retrieval_score).
  const order = new Map(rows.map((r, i) => [r.ticker, i]))
  filtered.sort((a, b) => (order.get(a.ticker) ?? 0) - (order.get(b.ticker) ?? 0))
  return filtered
}

export interface SampleDebug {
  bucket_coverage_in_pool?: Record<string, number>
  buckets_underrepresented?: string[]
  tail_added_per_bucket?: Record<string, number>
  must_have_per_bucket?: Record<string, string[]>
  trimmed_for_max_eval?: number
}

export function stratifiedSample(
  candidates: RetrievedTicker[],
  opts: SampleOptions = {},
): { must_have: RetrievedTicker[]; top: RetrievedTicker[]; mid: RetrievedTicker[]; tail: RetrievedTicker[]; debug: SampleDebug } {
  const top = opts.top ?? 30
  const midTo = opts.mid_to ?? 100
  const strategy = opts.tail_strategy ?? 'random'
  const pool = opts.dedupe_dual_class ? dedupeDualClass(candidates) : candidates
  const topSlice = pool.slice(0, top)
  const midSlice = pool.slice(top, midTo)
  const tailPool = pool.slice(midTo)
  const tailSlice: RetrievedTicker[] = []
  const debug: SampleDebug = {}

  // Per-bucket top-N guarantee. Computed off the *full* deduped pool so we
  // catch the canonical names regardless of where they fall in the global rank.
  const mustHave: RetrievedTicker[] = []
  const mustHaveSeen = new Set<string>()
  if (opts.per_bucket_must_have && opts.archetype_buckets && opts.archetype_buckets.length > 0) {
    const threshold = opts.bucket_weight_threshold ?? 0.5
    const N = opts.per_bucket_must_have
    const coreBuckets = opts.archetype_buckets.filter(b => b.weight >= threshold)
    const perBucket: Record<string, string[]> = {}
    for (const b of coreBuckets) {
      // D2 selection: primary_bucket=this bucket wins first (pure-play priority),
      // retrieval_score DESC within each primary group. Catches HAL/SLB/BKR for
      // energy/services and VST/CEG/NRG for utilities/power — single-bucket pure
      // plays that rank below diversified multi-bucket names on raw retrieval_score.
      const inBucket = pool
        .filter(p => (p.industry_buckets ?? []).includes(b.industry_bucket))
        .sort((x, y) => {
          const xPrim = x.primary_bucket === b.industry_bucket ? 0 : 1
          const yPrim = y.primary_bucket === b.industry_bucket ? 0 : 1
          if (xPrim !== yPrim) return xPrim - yPrim
          return y.retrieval_score - x.retrieval_score
        })
        .slice(0, N)
      perBucket[b.industry_bucket] = inBucket.map(t => t.ticker)
      for (const t of inBucket) {
        if (!mustHaveSeen.has(t.ticker)) {
          mustHaveSeen.add(t.ticker)
          mustHave.push(t)
        }
      }
    }
    debug.must_have_per_bucket = perBucket
  }

  if (strategy === 'random') {
    const tailN = opts.tail_random ?? 20
    if (tailPool.length <= tailN) {
      tailSlice.push(...tailPool)
    } else {
      const idx = new Set<number>()
      while (idx.size < tailN) idx.add(Math.floor(Math.random() * tailPool.length))
      for (const i of [...idx].sort((a, b) => a - b)) tailSlice.push(tailPool[i])
    }
  } else {
    // bucket-aware: derive archetype buckets from union of all matched_buckets
    const archetypeBuckets = new Set<string>()
    for (const c of pool) for (const b of c.matched_buckets) archetypeBuckets.add(b)

    const head = [...topSlice, ...midSlice]
    const coverage: Record<string, number> = {}
    for (const b of archetypeBuckets) {
      coverage[b] = head.filter(p => p.matched_buckets.includes(b)).length
    }
    debug.bucket_coverage_in_pool = coverage

    const minPer = opts.min_per_bucket ?? 3
    const perAdd = opts.per_bucket_add ?? 2
    const maxAdd = opts.max_add ?? 25

    const under = [...archetypeBuckets].filter(b => coverage[b] < minPer)
    debug.buckets_underrepresented = under

    const added: Record<string, number> = {}
    const seen = new Set<string>()
    // Sort under-covered buckets by deficit desc — fill the worst first.
    under.sort((a, b) => (coverage[a] ?? 0) - (coverage[b] ?? 0))
    for (const b of under) {
      if (tailSlice.length >= maxAdd) break
      const want = Math.min(perAdd, maxAdd - tailSlice.length)
      const candidatesForBucket = tailPool.filter(p => p.matched_buckets.includes(b) && !seen.has(p.ticker))
      const picks = candidatesForBucket.slice(0, want)
      for (const p of picks) { tailSlice.push(p); seen.add(p.ticker) }
      added[b] = picks.length
    }
    debug.tail_added_per_bucket = added
  }

  // Dedup top/mid/tail against must_have (must_have wins; sampling slots that
  // would re-pick a must_have ticker are simply dropped, not replaced).
  const dedup = (xs: RetrievedTicker[]) => xs.filter(t => !mustHaveSeen.has(t.ticker))
  let topOut = dedup(topSlice)
  let midOut = dedup(midSlice)
  let tailOut = dedup(tailSlice)

  // Trim to max_eval if set — drop from tail first, then mid (never must_have, never top).
  if (opts.max_eval) {
    let total = mustHave.length + topOut.length + midOut.length + tailOut.length
    let trimmed = 0
    if (total > opts.max_eval) {
      const overflow = total - opts.max_eval
      const fromTail = Math.min(tailOut.length, overflow)
      tailOut = tailOut.slice(0, tailOut.length - fromTail)
      trimmed += fromTail
      const stillOver = overflow - fromTail
      if (stillOver > 0) {
        const fromMid = Math.min(midOut.length, stillOver)
        midOut = midOut.slice(0, midOut.length - fromMid)
        trimmed += fromMid
      }
    }
    if (trimmed > 0) debug.trimmed_for_max_eval = trimmed
  }

  return { must_have: mustHave, top: topOut, mid: midOut, tail: tailOut, debug }
}

const SYSTEM_PROMPT = `You are a thematic-investing analyst evaluating a stock universe for relevance to a specific investment theme.

For each ticker provided, estimate exposure_pct (0–100) measuring how much of the company's business or stock price is *directly driven* by the theme:

- 90–100: **Pure play** — 70%+ of revenue / business directly driven by the theme; stock trades as a proxy for the theme.
- 60–89: **High exposure** — core business segment significantly affected; theme is a top driver but not the whole story.
- 30–59: **Moderate exposure** — meaningful exposure but not dominant; one of several drivers.
- 1–29: **Marginal exposure** — partial business line, second-order beneficiary, or sector-adjacent.

Also output:
- **tier**: 1 = pure play / dominant exposure (exposure_pct ≥ 70); 2 = meaningful exposure (30–69); 3 = marginal/sector-adjacent (< 30).
- **exposure_direction**: "benefits" / "headwind" / "mixed" / "uncertain".
- **reasoning**: ONE short English sentence naming the specific business aspect affected (e.g. "AWS cloud is core profit driver for AI infrastructure capex demand").

# Discipline
- Don't anchor on market cap. Apple is NOT a pure-play AI Capex name even if huge. A small pure-play (e.g. VST, CEG for AI power) can score 90+ while a mega-cap with tangential exposure (e.g. AAPL for AI Capex) scores 30.
- The provided industry buckets are a *recall hint*, not a verdict. A ticker matched on tech/hardware may still be low exposure if its hardware isn't AI-related.
- Be especially critical of financials/banks for crypto themes, consumer staples for healthcare themes, etc. — sector-adjacent does not mean themed.

# Output format
Return ONLY a JSON object, no prose. Schema:
{
  "scores": [
    { "ticker": "<symbol>", "exposure_pct": <0-100>, "tier": <1|2|3>, "exposure_direction": "<benefits|headwind|mixed|uncertain>", "reasoning": "<one sentence>" },
    ...
  ]
}

Every input ticker MUST appear in scores exactly once — do not skip any.`

function buildUserMessage(theme: ThemeContext, tickers: RetrievedTicker[]): string {
  const lines: string[] = []
  lines.push(`# Theme`)
  lines.push(`name: ${theme.name}`)
  lines.push(`archetype: ${theme.archetype_name}`)
  lines.push(`summary: ${theme.summary}`)
  lines.push('')
  // R2 · archetype guards. The retrieval layer recalls anything bucket-overlapping;
  // these tell the LLM which matches are out-of-scope (cap at Tier 3) or which
  // sectors it should expect for genuine Tier 1 candidates.
  const excl = theme.exclusion_rules ?? []
  lines.push(`# Exclusion rules (do NOT score these as Tier 1 even if they match buckets)`)
  if (excl.length === 0) lines.push('none')
  else for (const r of excl) lines.push(`- ${r}`)
  lines.push('')
  const sectors = theme.expected_sectors ?? []
  lines.push(`# Expected sectors (Tier 1 candidates should match these)`)
  lines.push(sectors.length === 0 ? 'broad' : sectors.join(', '))
  lines.push('')
  lines.push(`# Tickers to evaluate (${tickers.length})`)
  lines.push('Format: TICKER · company_name · primary_bucket · industry_buckets · matched_buckets · market_cap_$M')
  for (const t of tickers) {
    const mcM = t.market_cap ? Math.round(t.market_cap / 1e6) : 0
    lines.push(`${t.ticker} · ${t.company_name} · ${t.primary_bucket} · [${t.industry_buckets.join(',')}] · matched=[${t.matched_buckets.join(',')}] · ${mcM}M`)
  }
  return lines.join('\n')
}

function extractJson(text: string): { scores: ScoredTicker[] } {
  let s = text.trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('no JSON object in LLM response')
  return JSON.parse(s.slice(first, last + 1))
}

export async function scoreTickersForTheme(
  theme: ThemeContext,
  tickers: RetrievedTicker[],
  opts: { model?: string } = {},
): Promise<{ scores: ScoredTicker[]; usage: SamplingResult['usage']; cost_usd: number }> {
  if (tickers.length === 0) {
    return { scores: [], usage: { in: 0, out: 0, cache_read: 0, cache_create: 0 }, cost_usd: 0 }
  }
  const model = opts.model ?? MODEL_SONNET
  const userMessage = buildUserMessage(theme, tickers)

  let res
  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 16000,
      temperature: 0,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    })
    res = await stream.finalMessage()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        tags: { function: 'scoreTickersForTheme', file: 'lib/ticker-llm-scoring.ts', model, archetype: theme.archetype_name },
        extra: { theme_name: theme.name, ticker_count: tickers.length },
      })
    }
    throw error
  }
  const usage = {
    in: res.usage.input_tokens,
    out: res.usage.output_tokens,
    cache_read: res.usage.cache_read_input_tokens ?? 0,
    cache_create: res.usage.cache_creation_input_tokens ?? 0,
  }
  // Sonnet 4.5 pricing: $3/M in, $15/M out, $0.30/M cache read, $3.75/M cache create
  const cost_usd =
    (usage.in / 1e6) * 3 +
    (usage.out / 1e6) * 15 +
    (usage.cache_read / 1e6) * 0.3 +
    (usage.cache_create / 1e6) * 3.75

  const text = res.content
    .filter(b => b.type === 'text')
    .map(b => (b as { text: string }).text)
    .join('\n')
  const parsed = extractJson(text)

  // Validate + clamp
  const scored: ScoredTicker[] = []
  const seen = new Set<string>()
  for (const r of parsed.scores ?? []) {
    if (!r?.ticker || seen.has(r.ticker)) continue
    seen.add(r.ticker)
    const pct = Math.max(0, Math.min(100, Math.round(Number(r.exposure_pct) || 0)))
    const tier = computeTier(pct, 'industry_retrieval')
    const dir = (['benefits', 'headwind', 'mixed', 'uncertain'] as const).includes(r.exposure_direction)
      ? r.exposure_direction
      : 'uncertain'
    scored.push({
      ticker: r.ticker,
      exposure_pct: pct,
      tier,
      exposure_direction: dir as ExposureDirection,
      reasoning: String(r.reasoning ?? '').slice(0, 400),
    })
  }
  return { scores: scored, usage, cost_usd }
}
