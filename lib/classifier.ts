import pLimit from 'p-limit'
import { anthropic, MODEL_HAIKU, MODEL_SONNET } from './anthropic'
import { supabaseAdmin } from './supabase-admin'
import { isSecFiling, SEC_DEFER_REASONING } from './sec-filter'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventRow {
  id: string
  headline: string
  raw_content: string | null
  source_name: string | null
}

interface ClassificationResult {
  pattern_id: string | null
  classification_confidence: number | null
  mentioned_tickers: string[]
  novel_tickers: string[]
  classifier_reasoning: string
  status: 'classified' | 'exploratory' | 'irrelevant' | 'deferred_sec' | 'error'
}

export interface ClassifySummary {
  processed: number
  classified: number
  exploratory: number
  irrelevant: number
  deferred_sec: number
  errors: number
  cost_estimate_usd: number
  duration_ms: number
}

// ─── Pattern + ticker context (loaded once) ───────────────────────────────────

const PATTERNS_CONTEXT = `
hyperscaler_mega_capex | 超大规模 AI 数据中心 capex 公告
  Hyperscaler or neocloud announces GW-scale AI data center build, deal ≥$5B.
  Causal chain: Hyperscaler capex → massive GPU demand → optical modules + substrates → power & cooling.
  Keywords: gigawatt, GW, data center buildout, capex expansion, Stargate, AI infrastructure investment.

mega_cap_strategic_investment | NVDA/AVGO 等大厂对上游战略投资或 JV
  Large tech/semi company makes strategic equity investment or multi-year supply deal in upstream supplier.
  Causal chain: Investment = capacity-lock signal → category re-pricing → alpha in peers & upstream.
  Keywords: strategic investment, joint venture, equity stake, multi-year supply agreement, $X billion investment.

us_china_semi_export_control | 美国对华半导体/关键材料出口管制升级
  US BIS adds entity-list entries, expands chip ban, or restricts critical material exports to China.
  Causal chain: Export control → price expectation for controlled goods → upstream materials demand spike.
  Keywords: export control, BIS entity list, chip ban, licensing requirement, rare earth restriction, gallium.

smallcap_earnings_beat_guide_up | 小盘股财报超预期 + 指引显著上修
  Market cap <$5B company beats consensus significantly AND raises full-year guidance.
  Causal chain: Low analyst coverage → consensus distortion → big beat triggers model reset → institutional follow.
  Keywords: beat estimates, raises guidance, record revenue, above consensus, accelerating growth.

strategic_acquisition_in_sector | 大厂收购细分赛道公司
  Large tech/industrial acquires sector leader ≥$1B all-cash or at premium.
  Causal chain: Acquirer sets valuation floor → market hunts next target → small-cap multiples re-rate.
  Keywords: to acquire, definitive agreement, all-cash deal, vertical integration, tuck-in acquisition.

war_geopolitical_escalation | 战争爆发或地缘冲突显著升级
  Military conflict breaks out or escalates significantly, affecting energy/shipping/defense supply chains.
  Causal chain: Conflict → (1) energy supply risk → oil/gas spike (2) defense budget → backlog expansion (3) risk-off → VIX + gold.
  Keywords: military strike, missile launch, invasion, troops deployed, sanctions imposed, strait closure.

natural_disaster_catastrophe | 自然灾害或重大工业事故
  Hurricane, earthquake, wildfire, or industrial accident disrupts key supply chains or triggers rebuilding demand.
  Causal chain: Disaster → supply reduction or demand spike → asset price spike → short alpha window T+1 to T+30.
  Keywords: hurricane, earthquake, wildfire, flood, fab shutdown, plant fire, pipeline rupture, port closure.
`.trim()

const KNOWN_TICKERS =
  'AAOI AEHR AMAT AMD AMZN ANET ARM ASML AVGO AXTI BLDR CLS COHR CVX DAC ETN FN GD GFS GLD GNRC HD HII INTC LITE LMT LNG LOW LRCX META MP MPC MRVL MU NEE NEXT NOC ORCL OXY PSX RTX UUUU VLO VRT XOM ZIM'

// ─── Stage 1: Haiku pre-filter ────────────────────────────────────────────────

async function haikusFilter(headline: string, snippet: string): Promise<{ relevant: boolean; reason: string }> {
  const prompt = `You are a financial news pre-filter. Given this headline and snippet, return JSON: {"relevant": boolean, "reason": "one sentence"}.

Relevant = news about: AI infrastructure, semiconductors, hyperscaler investments, chip export controls, mergers in tech/energy/defense, small-cap earnings beats, geopolitical conflicts affecting markets, natural disasters affecting supply chains.

Not relevant = politics without market impact, sports, entertainment, lifestyle, non-market news.

Headline: ${headline}
Snippet: ${snippet.slice(0, 500)}`

  const msg = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 100,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (msg.content[0] as { type: string; text: string }).text.trim()
  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    return { relevant: Boolean(json.relevant), reason: String(json.reason ?? '') }
  } catch {
    // If Haiku returns non-JSON, treat as relevant to avoid false negatives
    return { relevant: true, reason: 'parse error - treated as relevant' }
  }
}

// ─── Stage 2: Sonnet full classification ──────────────────────────────────────

interface SonnetResult {
  pattern_id: string | null
  confidence: number
  mentioned_tickers: string[]
  novel_tickers: string[]
  reasoning: string
}

async function sonnetClassify(headline: string, snippet: string): Promise<SonnetResult> {
  const prompt = `You are a financial event classifier for a news-driven stock recommendation tool. Classify this news into one of the following patterns, or return null if none fit well.

AVAILABLE PATTERNS:
${PATTERNS_CONTEXT}

KNOWN TICKERS (our database covers these, but you can mention others):
${KNOWN_TICKERS}

NEWS:
Headline: ${headline}
Snippet: ${snippet.slice(0, 1500)}

Return JSON only, no markdown:
{
  "pattern_id": string | null,
  "confidence": number between 0.0 and 1.0,
  "mentioned_tickers": [],
  "novel_tickers": [],
  "reasoning": "one sentence explaining the classification or why null"
}

Rules:
- Return null pattern_id if confidence < 0.6 or no pattern fits well. Better to leave unclassified than wrongly classified.
- mentioned_tickers: all proper ticker symbols found (uppercase, 1-5 chars). Include both known and novel.
- novel_tickers: subset of mentioned_tickers NOT in the KNOWN TICKERS list above.
- For company names without a clear ticker symbol, skip.`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 400,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (msg.content[0] as { type: string; text: string }).text.trim()
  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
    return {
      pattern_id: json.pattern_id ?? null,
      confidence: typeof json.confidence === 'number' ? json.confidence : 0,
      mentioned_tickers: Array.isArray(json.mentioned_tickers) ? json.mentioned_tickers : [],
      novel_tickers: Array.isArray(json.novel_tickers) ? json.novel_tickers : [],
      reasoning: String(json.reasoning ?? ''),
    }
  } catch {
    return { pattern_id: null, confidence: 0, mentioned_tickers: [], novel_tickers: [], reasoning: 'parse error' }
  }
}

// ─── Per-event cost estimate ──────────────────────────────────────────────────
// Rough: Haiku ~500 input + 100 output = $0.0004, Sonnet ~2500 input + 400 output = $0.015
const COST_HAIKU_ONLY = 0.0004
const COST_HAIKU_PLUS_SONNET = 0.016

// ─── Public API ───────────────────────────────────────────────────────────────

export async function classifyEvent(event: EventRow): Promise<ClassificationResult> {
  if (isSecFiling(event)) {
    return {
      pattern_id: null,
      classification_confidence: null,
      mentioned_tickers: [],
      novel_tickers: [],
      classifier_reasoning: SEC_DEFER_REASONING,
      status: 'deferred_sec',
    }
  }

  const headline = event.headline
  const snippet = event.raw_content ?? ''

  try {
    // Stage 1: Haiku pre-filter
    const { relevant, reason } = await haikusFilter(headline, snippet)

    if (!relevant) {
      return {
        pattern_id: null,
        classification_confidence: null,
        mentioned_tickers: [],
        novel_tickers: [],
        classifier_reasoning: `[irrelevant] ${reason}`,
        status: 'irrelevant',
      }
    }

    // Stage 2: Sonnet full classification
    const result = await sonnetClassify(headline, snippet)

    const status = result.pattern_id ? 'classified' : 'exploratory'
    return {
      pattern_id: result.pattern_id,
      classification_confidence: result.confidence > 0 ? result.confidence : null,
      mentioned_tickers: result.mentioned_tickers,
      novel_tickers: result.novel_tickers,
      classifier_reasoning: result.reasoning,
      status,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      pattern_id: null,
      classification_confidence: null,
      mentioned_tickers: [],
      novel_tickers: [],
      classifier_reasoning: `Error: ${msg}`,
      status: 'error',
    }
  }
}

export async function classifyPendingEvents(options: {
  limit?: number
  rate_limit?: number
} = {}): Promise<ClassifySummary> {
  const { limit = 50, rate_limit = 5 } = options
  const start = Date.now()

  // Fetch unclassified events (pattern_id IS NULL AND classifier_reasoning IS NULL)
  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('id, headline, raw_content, source_name')
    .is('pattern_id', null)
    .is('classifier_reasoning', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch pending events: ${error.message}`)
  if (!events || events.length === 0) {
    return { processed: 0, classified: 0, exploratory: 0, irrelevant: 0, deferred_sec: 0, errors: 0, cost_estimate_usd: 0, duration_ms: 0 }
  }

  console.log(`[classifier] Processing ${events.length} events (rate_limit=${rate_limit})`)

  const limiter = pLimit(rate_limit)
  const results = await Promise.all(
    events.map((event) =>
      limiter(async () => {
        const r = await classifyEvent(event as EventRow)
        console.log(`[classifier] ${event.id.slice(0, 8)} → ${r.status} ${r.pattern_id ?? '(null)'}`)
        return { id: event.id, result: r }
      })
    )
  )

  // Batch update
  const updates = results.map(({ id, result }) => ({
    id,
    pattern_id: result.pattern_id,
    classification_confidence: result.classification_confidence,
    mentioned_tickers: result.mentioned_tickers.length > 0 ? result.mentioned_tickers : null,
    novel_tickers: result.novel_tickers.length > 0 ? result.novel_tickers : null,
    classifier_reasoning: result.classifier_reasoning,
  }))

  for (const u of updates) {
    const { error: uerr } = await supabaseAdmin
      .from('events')
      .update({
        pattern_id: u.pattern_id,
        classification_confidence: u.classification_confidence,
        mentioned_tickers: u.mentioned_tickers,
        novel_tickers: u.novel_tickers,
        classifier_reasoning: u.classifier_reasoning,
      })
      .eq('id', u.id)

    if (uerr) console.warn(`[classifier] Update failed for ${u.id}: ${uerr.message}`)
  }

  // Tally
  let classified = 0, exploratory = 0, irrelevant = 0, deferred_sec = 0, errors = 0
  for (const { result } of results) {
    if (result.status === 'classified') classified++
    else if (result.status === 'exploratory') exploratory++
    else if (result.status === 'irrelevant') irrelevant++
    else if (result.status === 'deferred_sec') deferred_sec++
    else errors++
  }

  const sonnetCount = classified + exploratory
  const haikuOnlyCount = irrelevant
  const cost_estimate_usd =
    Math.round((sonnetCount * COST_HAIKU_PLUS_SONNET + haikuOnlyCount * COST_HAIKU_ONLY) * 10000) / 10000

  return {
    processed: results.length,
    classified,
    exploratory,
    irrelevant,
    deferred_sec,
    errors,
    cost_estimate_usd,
    duration_ms: Date.now() - start,
  }
}
