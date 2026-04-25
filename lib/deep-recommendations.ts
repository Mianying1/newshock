import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'
import { normalizeSector } from '@/lib/sector-normalize'

export const DEEP_VERSION = 'v1'

export interface ThemeRow {
  id: string
  name: string
  summary: string | null
  archetype_id: string | null
}

export interface ArchetypeRow {
  id: string
  category: string | null
  playbook: Record<string, unknown> | null
  expected_sectors: string[] | null
}

interface EventRow {
  id: string
  headline: string
  source_name: string | null
  source_url?: string | null
  event_date: string
  mentioned_tickers: string[] | null
}

interface RecRow {
  ticker_symbol: string
  tier: number
  role_reasoning: string | null
  exposure_direction: string | null
}

export interface DeepRecommendation {
  ticker: string
  company_name: string
  tier: 1 | 2 | 3
  direction: 'benefits' | 'headwind' | 'mixed'
  role: string
  business_exposure: string
  business_exposure_zh: string
  business_segment: string | null
  evidence_event_ids: string[]
  reasoning: string
  reasoning_zh: string
  catalyst: string
  catalyst_zh: string
  risk: string
  risk_zh: string
  market_cap_band: 'small' | 'mid' | 'large'
  is_pure_play: boolean
  is_often_missed: boolean
  confidence: number
}

export type DriverIcon = 'bolt' | 'building' | 'chip' | 'globe' | 'chart' | 'factory' | 'shield'

export interface RecentDriver {
  icon: DriverIcon
  title: string
  title_zh: string
  description: string
  description_zh: string
  source_label: string
  source_url: string | null
}

export interface DeepOutput {
  theme_reflection: string
  theme_reflection_zh: string
  recent_drivers: RecentDriver[]
  recommendations: DeepRecommendation[]
  tickers_removed_from_current: { ticker: string; why_removed: string }[]
  new_tickers_added: string[]
}

export interface DeepRunStats {
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

function summarizePlaybook(pb: Record<string, unknown> | null) {
  if (!pb) return { thesis: '(no playbook)', structural: '', historical: '', exit: '' }
  const p = pb as {
    thesis?: string
    this_time_different?: string | { summary?: string; bullets?: string[] }
    historical_cases?: { name: string; approximate_duration?: string; peak_move?: string }[]
    exit_signals?: (string | { name: string; description?: string })[]
  }
  const structural =
    typeof p.this_time_different === 'string'
      ? p.this_time_different
      : typeof p.this_time_different === 'object' && p.this_time_different
        ? [p.this_time_different.summary, ...(p.this_time_different.bullets ?? [])]
            .filter(Boolean)
            .join('\n  ')
        : ''
  const historical = (p.historical_cases ?? [])
    .slice(0, 3)
    .map(
      (c) =>
        `- ${c.name}${c.approximate_duration ? ` (${c.approximate_duration})` : ''}${c.peak_move ? `: ${truncate(c.peak_move, 180)}` : ''}`
    )
    .join('\n')
  const exit = (p.exit_signals ?? [])
    .slice(0, 6)
    .map((s) =>
      typeof s === 'string'
        ? `- ${s}`
        : `- ${s.name}${s.description ? `: ${truncate(s.description, 120)}` : ''}`
    )
    .join('\n')
  return {
    thesis: p.thesis ?? '(inferred from theme description)',
    structural: structural || '(none)',
    historical: historical || '(none)',
    exit: exit || '(none)',
  }
}

function buildPrompt({
  theme,
  arch,
  currentRecs,
  events,
}: {
  theme: ThemeRow
  arch: ArchetypeRow | null
  currentRecs: RecRow[]
  events: EventRow[]
}): string {
  const pb = summarizePlaybook(arch?.playbook ?? null)
  const durationType =
    (arch?.playbook as { duration_type?: string } | null | undefined)?.duration_type ?? 'unknown'

  // Recency tagging (subtask 20.3): events are ordered newest-first by the
  // caller. We label each by age bucket so the LLM weights NEW events over
  // OLD ones. The 90d cutoff is enforced upstream by the events query.
  const now = Date.now()
  function recencyTag(eventDate: string): string {
    const days = Math.max(0, Math.floor((now - new Date(eventDate).getTime()) / 86_400_000))
    if (days < 30) return 'NEW'
    if (days < 60) return 'RECENT'
    return 'OLD'
  }
  const eventsBlock = events
    .slice(0, 15)
    .map(
      (e) =>
        `[event_id: ${e.id}] ${e.event_date.slice(0, 10)} (${recencyTag(e.event_date)}) · ${e.source_name ?? 'Press'}${e.source_url ? ` (${e.source_url})` : ''} · ${e.headline}${e.mentioned_tickers?.length ? ` [tickers: ${e.mentioned_tickers.slice(0, 6).join(', ')}]` : ''}`
    )
    .join('\n')

  const currentBlock = currentRecs
    .map(
      (r) =>
        `- Tier ${r.tier} · ${r.ticker_symbol} (${r.exposure_direction ?? 'uncertain'}): ${truncate(r.role_reasoning, 140)}`
    )
    .join('\n')

  return `You are a senior thematic investment strategist at a top hedge fund.

Your task: Generate an investment-grade ticker recommendation for a theme.
Unlike surface-level screens, think deeply about ALL possible beneficiaries/headwinds.

===

THEME CONTEXT:

Name: ${theme.name}
Description: ${theme.summary ?? '(no summary)'}
Category: ${arch?.category ?? 'unknown'}
Duration: ${durationType}

THESIS:
${pb.thesis}

WHY THIS TIME IS DIFFERENT:
${pb.structural}

HISTORICAL PLAYBOOK:
${pb.historical}

EXIT SIGNALS:
${pb.exit}

RECENT EVENTS (reverse chronological · last 90 days · up to 15):
Events are tagged by age. Weight NEW events more heavily — they reflect the
latest theme dynamics (e.g. fresh policy moves, recent earnings pivots).
RECENT events still inform but are likely already partially priced in.
OLD events are shown for continuity but should not drive judgments alone.
  - NEW    · < 30 days
  - RECENT · 30–60 days
  - OLD    · 60–90 days
${eventsBlock || '(no recent events)'}

CURRENT RECOMMENDATIONS (for reference, we want to improve):
${currentBlock || '(none)'}

===

TASK:

Generate comprehensive ticker recommendations covering the FULL 2nd-order network.

Think through these layers:

1. DIRECT BENEFICIARIES (Tier 1) — pure plays with 70%+ revenue from theme
2. INDIRECT BENEFICIARIES (Tier 2) — suppliers, infrastructure, enablers
3. PERIPHERAL (Tier 3) — second-order, sentiment beneficiaries
4. HEADWINDS — who loses (substitutes, competitors, disrupted incumbents)
5. HIDDEN ANGLES — foreign ADRs, small caps, REITs/ETFs, private-market proxies

For each ticker: why the tier, specific business exposure, catalyst to move, what breaks the thesis.

Include US + major ADRs (Canada, UK, Japan, Europe), range of caps, mix of pure play and diversified.

EVIDENCE REQUIREMENTS (subtask 20.2 — strict):
- For each rec, cite at least one event_id from the RECENT EVENTS list above
  in the "evidence_event_ids" field. Use the literal UUIDs shown in brackets.
- If you cannot find any event in the list that supports the rec, OMIT the
  rec entirely. Do NOT fabricate event_ids — they are validated against the DB.
- Name the specific business_segment that connects the ticker to the theme
  (e.g. "Foundry only", "AI Capex GPUs", "Power generation"). For pure plays
  use the company's primary segment.
- Reasoning must reference concrete events / earnings / product launches.
  AVOID textbook claims like "GPU eats CPU", "DTC kills retail", "rate cuts
  always lift biotech" — these are filtered out by the self-consistency pass.

===

OUTPUT (valid JSON only, no markdown):

{
  "theme_reflection": "2-3 sentences: conviction take and current positioning opportunity",
  "theme_reflection_zh": "中文版",
  "recent_drivers": [
    {
      "icon": "bolt|building|chip|globe|chart|factory|shield",
      "title": "Short headline 4-8 words (e.g. 'Data-center power demand surge')",
      "title_zh": "中文短标题 (4-8 字)",
      "description": "1-2 sentences with a quantitative stat where possible",
      "description_zh": "中文描述",
      "source_label": "Primary source + month (e.g. 'IEA, 2024.04')",
      "source_url": "https://... or null"
    }
  ],
  "recommendations": [
    {
      "ticker": "TICKER",
      "company_name": "Company Name",
      "tier": 1,
      "direction": "benefits|headwind|mixed",
      "role": "pure_play_beneficiary|infrastructure_enabler|...",
      "business_exposure": "% of business + specific segment",
      "business_exposure_zh": "中文",
      "business_segment": "Specific line of business · e.g. 'Foundry only', 'AI GPUs', 'Power generation'",
      "evidence_event_ids": ["uuid1", "uuid2"],
      "reasoning": "Why this ticker, 1 sentence — must reference cited evidence",
      "reasoning_zh": "中文",
      "catalyst": "What event moves it",
      "catalyst_zh": "中文",
      "risk": "What breaks the thesis",
      "risk_zh": "中文",
      "market_cap_band": "small|mid|large",
      "is_pure_play": true,
      "is_often_missed": false,
      "confidence": 80
    }
  ],
  "tickers_removed_from_current": [{ "ticker": "X", "why_removed": "reasoning" }],
  "new_tickers_added": ["TICKER1"]
}

Target: 15-20 total recommendations (strict — max_tokens=6000).
Quality > Quantity. If only 12 make sense, return 12.

Length budget (HARD limits):
- reasoning / reasoning_zh: ≤ 140 chars, 1 sentence
- business_exposure / _zh: ≤ 90 chars
- catalyst / _zh, risk / _zh: ≤ 80 chars each
- theme_reflection / _zh: ≤ 280 chars
- recent_drivers: 3-5 items. title/title_zh ≤ 18 chars. description/_zh ≤ 120 chars. Cluster the recent events into thematic drivers — pick the strongest stat-bearing source per cluster. Pick icon by cluster type: bolt=power/grid/energy, building=hyperscaler/capex/earnings, chip=semi/GPU/foundry, globe=geopolitics/trade, chart=demand/market data, factory=supply/manufacturing, shield=policy/regulation.

Return ONLY valid JSON, no markdown.`
}

function lenientParse(text: string): DeepOutput {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const full = cleaned.match(/\{[\s\S]*\}/)
  if (full) {
    try {
      return full[0].length > 0 ? (JSON.parse(full[0]) as DeepOutput) : (null as never)
    } catch {
      // fall through
    }
  }

  const reflection = cleaned.match(/"theme_reflection"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  const reflectionZh = cleaned.match(/"theme_reflection_zh"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  const recsStart = cleaned.indexOf('"recommendations"')
  const arrStart = recsStart >= 0 ? cleaned.indexOf('[', recsStart) : -1
  const recs: unknown[] = []
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
      try {
        recs.push(JSON.parse(cleaned.slice(start, i)))
      } catch {
        break
      }
    }
  }

  return {
    theme_reflection: reflection ? JSON.parse(`"${reflection[1]}"`) : '',
    theme_reflection_zh: reflectionZh ? JSON.parse(`"${reflectionZh[1]}"`) : '',
    recent_drivers: [],
    recommendations: recs as DeepRecommendation[],
    tickers_removed_from_current: [],
    new_tickers_added: [],
  }
}

function tokenCost(input: number, output: number): number {
  // Sonnet 4.5 list: $3 / Mtok input, $15 / Mtok output
  return (input * 3 + output * 15) / 1_000_000
}

// Self-consistency Pass 2 (subtask 20.4).
// Hands the Pass 1 recommendations back to Sonnet with a critical-review
// prompt. Returns one verdict per ticker: KEEP / REVISE / REMOVE. The
// caller applies them: REMOVE drops the row, REVISE rewrites confidence
// and appends a caveat to role_reasoning, KEEP is a no-op.
export type Pass2Verdict = 'KEEP' | 'REVISE' | 'REMOVE'

export interface Pass2RecAction {
  ticker_symbol: string
  verdict: Pass2Verdict
  reasoning: string
  suggested_confidence?: number
  suggested_caveat?: string
}

export interface Pass2Result {
  actions: Pass2RecAction[]
  stats: DeepRunStats
}

interface Pass2Input {
  ticker_symbol: string
  tier: number
  exposure_direction: string | null
  business_segment: string | null
  role_reasoning: string | null
  evidence_event_ids: string[]
  confidence: number
  sector: string | null
  skip_reason: string | null
}

export async function callSelfConsistencyPass(input: {
  theme: ThemeRow
  arch: ArchetypeRow | null
  recs: Pass2Input[]
  events: EventRow[]
}): Promise<Pass2Result> {
  // Compact summary of the theme + each rec. We deliberately omit Pass 1's
  // catalyst/risk text — those weren't part of the original audit triggers
  // and adding them inflates the prompt without changing verdicts.
  const eventLookup = new Map(input.events.map((e) => [e.id, e]))
  const recsBlock = input.recs
    .map((r, i) => {
      const evidenceText = r.evidence_event_ids.length === 0
        ? '(none cited)'
        : r.evidence_event_ids
            .map((id) => {
              const e = eventLookup.get(id)
              return e ? `${id.slice(0, 8)}: ${e.headline.slice(0, 80)}` : `${id.slice(0, 8)}: (unknown)`
            })
            .join(' | ')
      return (
        `[${i + 1}] ${r.ticker_symbol} (sector=${r.sector ?? 'unknown'}, tier=${r.tier}, conf=${r.confidence}, dir=${r.exposure_direction ?? '?'})\n` +
        `    segment: ${r.business_segment ?? '(none)'}\n` +
        `    evidence: ${evidenceText}\n` +
        `    reasoning: ${(r.role_reasoning ?? '').replace(/\s+/g, ' ').slice(0, 240)}` +
        (r.skip_reason ? `\n    pre-flag: ${r.skip_reason}` : '')
      )
    })
    .join('\n\n')

  const prompt =
    `You are auditing your own previous Pass 1 recommendations for theme:\n` +
    `  Name: ${input.theme.name}\n` +
    `  Description: ${(input.theme.summary ?? '').slice(0, 300)}\n` +
    `  Archetype: ${input.arch?.id ?? '(none)'} (${input.arch?.category ?? ''})\n\n` +
    `PASS 1 RECOMMENDATIONS (${input.recs.length} total):\n\n${recsBlock}\n\n` +
    `Critically review each recommendation. For each one, decide:\n` +
    `  - KEEP   · Strong evidence, concrete reasoning, multi-faceted view.\n` +
    `  - REVISE · Some merit but confidence is too high or a caveat is missing.\n` +
    `  - REMOVE · Pure textbook logic, single-axis reasoning, sector mismatch,\n` +
    `             contradiction with other recs, OR weak/no evidence.\n\n` +
    `Watch specifically for:\n` +
    `  1. Textbook claims: "X eats Y", "DTC kills retail", "rate cuts always lift biotech".\n` +
    `  2. Single-axis reasoning that ignores other business segments of the company.\n` +
    `  3. Sector mismatch (use the sector= tag in the input).\n` +
    `  4. Cross-rec contradictions inside this theme (e.g. one says benefit, another says headwind for the same supply chain).\n` +
    `  5. Stale evidence: only OLD events cited.\n` +
    `  6. Recs flagged with pre-flag (sector_mismatch_high_conf_review, etc.) — re-judge them.\n\n` +
    `Return STRICT JSON ONLY (no markdown):\n` +
    `{\n` +
    `  "actions": [\n` +
    `    {\n` +
    `      "ticker_symbol": "TICKER",\n` +
    `      "verdict": "KEEP" | "REVISE" | "REMOVE",\n` +
    `      "reasoning": "1-2 sentences explaining the verdict",\n` +
    `      "suggested_confidence": 60,         // only when REVISE\n` +
    `      "suggested_caveat": "Short caveat"  // only when REVISE\n` +
    `    }\n` +
    `  ]\n` +
    `}`

  const started = Date.now()
  const resp = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })
  const elapsed = (Date.now() - started) / 1000
  const text = resp.content
    .filter((x: { type: string }) => x.type === 'text')
    .map((x: { type: string; text?: string }) => x.text ?? '')
    .join('')

  let actions: Pass2RecAction[] = []
  const m = text.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const json = JSON.parse(m[0]) as { actions?: Pass2RecAction[] }
      actions = (json.actions ?? []).filter(
        (a): a is Pass2RecAction =>
          typeof a?.ticker_symbol === 'string' &&
          (a.verdict === 'KEEP' || a.verdict === 'REVISE' || a.verdict === 'REMOVE')
      )
    } catch {
      // fall through · empty actions returned
    }
  }

  const input_tokens = resp.usage?.input_tokens ?? 0
  const output_tokens = resp.usage?.output_tokens ?? 0
  return {
    actions,
    stats: {
      input_tokens,
      output_tokens,
      cost_usd: tokenCost(input_tokens, output_tokens),
      elapsed_sec: elapsed,
      stop_reason: resp.stop_reason ?? null,
    },
  }
}

export async function callDeepReasoning(input: {
  theme: ThemeRow
  arch: ArchetypeRow | null
  currentRecs: { ticker_symbol: string; tier: number; role_reasoning: string | null; exposure_direction: string | null }[]
  events: EventRow[]
}): Promise<{ output: DeepOutput; stats: DeepRunStats }> {
  const prompt = buildPrompt(input)
  const started = Date.now()
  const stream = anthropic.messages.stream({
    model: MODEL_SONNET,
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  })
  let text = ''
  stream.on('text', (delta) => {
    text += delta
  })
  const final = await stream.finalMessage()
  const elapsed = (Date.now() - started) / 1000

  const output = lenientParse(text)
  const input_tokens = final.usage?.input_tokens ?? 0
  const output_tokens = final.usage?.output_tokens ?? 0
  const cost_usd = tokenCost(input_tokens, output_tokens)

  return {
    output,
    stats: {
      input_tokens,
      output_tokens,
      cost_usd,
      elapsed_sec: elapsed,
      stop_reason: final.stop_reason ?? null,
    },
  }
}

export interface ThemeProcessResult {
  theme_id: string
  theme_name: string
  ok: boolean
  error?: string
  recommendations_inserted: number
  often_missed: number
  added_tickers: string[]
  removed_tickers: string[]
  sector_mismatches?: number
  sector_mismatches_high_conf?: number
  no_evidence_count?: number
  hallucinated_event_count?: number
  pass2_kept?: number
  pass2_revised?: number
  pass2_removed?: number
  pass2_stats?: DeepRunStats
  stats?: DeepRunStats
}

export async function processTheme(themeId: string): Promise<ThemeProcessResult> {
  const { data: theme, error: themeErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, archetype_id')
    .eq('id', themeId)
    .maybeSingle()
  if (themeErr || !theme) {
    return {
      theme_id: themeId,
      theme_name: '(not found)',
      ok: false,
      error: themeErr?.message ?? 'theme not found',
      recommendations_inserted: 0,
      often_missed: 0,
      added_tickers: [],
      removed_tickers: [],
    }
  }
  const t = theme as ThemeRow

  const [archRes, recsRes, eventsRes] = await Promise.all([
    t.archetype_id
      ? supabaseAdmin
          .from('theme_archetypes')
          .select('id, category, playbook, expected_sectors')
          .eq('id', t.archetype_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from('theme_recommendations')
      .select('ticker_symbol, tier, role_reasoning, exposure_direction')
      .eq('theme_id', t.id),
    supabaseAdmin
      .from('events')
      .select('id, headline, source_name, source_url, event_date, mentioned_tickers')
      .eq('trigger_theme_id', t.id)
      .gte('event_date', new Date(Date.now() - 90 * 86_400_000).toISOString())
      .order('event_date', { ascending: false })
      .limit(30),
  ])

  const arch = (archRes.data ?? null) as ArchetypeRow | null
  const currentRecs = (recsRes.data ?? []) as RecRow[]
  const events = (eventsRes.data ?? []) as EventRow[]

  let attempt = 0
  let lastErr: string | undefined
  let result: { output: DeepOutput; stats: DeepRunStats } | null = null
  while (attempt < 2) {
    try {
      result = await callDeepReasoning({ theme: t, arch, currentRecs, events })
      if (result.output.recommendations.length === 0) {
        lastErr = 'parsed 0 recommendations'
        attempt++
        continue
      }
      break
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      attempt++
    }
  }

  if (!result || result.output.recommendations.length === 0) {
    return {
      theme_id: t.id,
      theme_name: t.name,
      ok: false,
      error: lastErr ?? 'empty result',
      recommendations_inserted: 0,
      often_missed: 0,
      added_tickers: [],
      removed_tickers: [],
    }
  }

  // Upsert-style: ensure ticker exists in `tickers` (FK), then delete old recs, insert new.
  const uniqueTickers = Array.from(new Set(result.output.recommendations.map((r) => r.ticker.toUpperCase())))
  const { data: existingTickers } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .in('symbol', uniqueTickers)
  const existingSet = new Set((existingTickers ?? []).map((x: { symbol: string }) => x.symbol))
  const missing = uniqueTickers.filter((s) => !existingSet.has(s))
  if (missing.length > 0) {
    const missingRows = missing
      .map((symbol) => {
        const spec = result!.output.recommendations.find((r) => r.ticker.toUpperCase() === symbol)
        return {
          symbol,
          company_name: spec?.company_name ?? symbol,
        }
      })
    const { error: insertTickerErr } = await supabaseAdmin.from('tickers').insert(missingRows)
    if (insertTickerErr) {
      return {
        theme_id: t.id,
        theme_name: t.name,
        ok: false,
        error: `ticker insert: ${insertTickerErr.message}`,
        recommendations_inserted: 0,
        often_missed: 0,
        added_tickers: [],
        removed_tickers: [],
        stats: result.stats,
      }
    }
  }

  const priorSymbols = new Set(currentRecs.map((r) => r.ticker_symbol))
  const nowSymbols = new Set(uniqueTickers)
  const added = Array.from(nowSymbols).filter((s) => !priorSymbols.has(s))
  const removed = Array.from(priorSymbols).filter((s) => !nowSymbols.has(s))

  // Sector baseline check (subtask 20.1).
  // archetype.expected_sectors lists which normalized sectors a rec must come
  // from. If a rec's ticker has a known sector that falls outside this list,
  // it is structurally suspicious — we keep the row for auditability but
  // demote its confidence_band to 'low' so the UI's confidence floor hides it.
  // Tickers with NULL sector are not gated (we don't know enough to penalize).
  // Empty expected_sectors[] disables the gate (legacy/unfilled archetypes).
  const expectedSet = new Set((arch?.expected_sectors ?? []).map((s) => normalizeSector(s)).filter(Boolean) as string[])
  const { data: tickerSectorRows } = await supabaseAdmin
    .from('tickers')
    .select('symbol, sector')
    .in('symbol', uniqueTickers)
  const tickerSector = new Map<string, string | null>()
  for (const row of (tickerSectorRows ?? []) as { symbol: string; sector: string | null }[]) {
    tickerSector.set(row.symbol, normalizeSector(row.sector))
  }
  let sectorMismatchCount = 0
  let sectorMismatchHighConf = 0

  // Evidence validation (subtask 20.2).
  // Recs must cite event_ids from the fetched events list. We:
  //   1. Filter LLM output to only event_ids that actually exist in the DB
  //      (catches hallucinated UUIDs).
  //   2. If a rec ends up with zero valid evidence, mark skip_reason='no_evidence'
  //      and demote to confidence_band='low'.
  // Empty events list (theme has no recent activity) disables the gate.
  const validEventIds = new Set(events.map((e) => e.id))
  const evidenceCheckEnabled = validEventIds.size > 0
  let noEvidenceCount = 0
  let hallucinatedEventCount = 0

  const generatedAt = new Date().toISOString()
  const rowsToInsert = result.output.recommendations.map((r) => {
    const symbol = r.ticker.toUpperCase()
    const baseConfidence = Math.max(0, Math.min(100, Math.round(r.confidence ?? 0)))
    const sector = tickerSector.get(symbol) ?? null
    const sectorMismatch =
      expectedSet.size > 0 && sector !== null && !expectedSet.has(sector)

    // Filter cited evidence to event_ids that actually exist.
    const citedRaw = Array.isArray(r.evidence_event_ids) ? r.evidence_event_ids : []
    const evidenceIds = citedRaw.filter((id) => validEventIds.has(id))
    if (citedRaw.length > evidenceIds.length) {
      hallucinatedEventCount += citedRaw.length - evidenceIds.length
    }
    const noEvidence = evidenceCheckEnabled && evidenceIds.length === 0

    let skipReason: string | null = null
    let confidenceBand: 'high' | 'medium' | 'low' | null = null
    if (noEvidence) {
      noEvidenceCount++
      skipReason = 'no_evidence'
      confidenceBand = 'low'
    } else if (sectorMismatch) {
      sectorMismatchCount++
      if (baseConfidence > 80) {
        // High-conf sector mismatch: keep visible but tag for review. The
        // ticker may legitimately bridge sectors (e.g. semiconductors firm
        // building defense chips); a human / Pass 2 should re-judge.
        sectorMismatchHighConf++
        skipReason = 'sector_mismatch_high_conf_review'
      } else {
        // Low/mid conf + sector outside expected list: hide from UI.
        skipReason = 'sector_mismatch'
        confidenceBand = 'low'
      }
    }
    return {
      theme_id: t.id,
      ticker_symbol: symbol,
      tier: r.tier,
      exposure_direction: r.direction,
      role_reasoning: r.reasoning,
      role_reasoning_zh: r.reasoning_zh,
      business_exposure: r.business_exposure,
      business_exposure_zh: r.business_exposure_zh,
      business_segment: r.business_segment ?? null,
      evidence_event_ids: evidenceIds,
      catalyst: r.catalyst,
      catalyst_zh: r.catalyst_zh,
      risk: r.risk,
      risk_zh: r.risk_zh,
      market_cap_band: r.market_cap_band,
      is_pure_play: r.is_pure_play,
      is_often_missed: r.is_often_missed,
      confidence: baseConfidence,
      confidence_band: confidenceBand,
      skip_reason: skipReason,
      deep_version: DEEP_VERSION,
      generated_at: generatedAt,
      added_at: generatedAt,
      last_confirmed_at: generatedAt,
    }
  })

  if (sectorMismatchCount > 0) {
    console.log(
      `  [sector-check] theme=${t.id.slice(0, 8)} mismatches=${sectorMismatchCount} (${sectorMismatchHighConf} high-conf kept, ${sectorMismatchCount - sectorMismatchHighConf} demoted)`
    )
  }
  if (noEvidenceCount > 0 || hallucinatedEventCount > 0) {
    console.log(
      `  [evidence-check] theme=${t.id.slice(0, 8)} no_evidence=${noEvidenceCount} hallucinated=${hallucinatedEventCount}`
    )
  }

  // Self-consistency Pass 2 (subtask 20.4).
  // Hand the post-check rows back to Sonnet for KEEP/REVISE/REMOVE verdicts.
  // Skip when Pass 1 produced too few recs to be worth a second LLM call.
  let pass2Stats: DeepRunStats | undefined
  let pass2Kept = 0
  let pass2Revised = 0
  let pass2Removed = 0
  let postPass2Rows = rowsToInsert
  if (rowsToInsert.length >= 3) {
    try {
      const pass2Input: Pass2Input[] = rowsToInsert.map((r) => ({
        ticker_symbol: r.ticker_symbol,
        tier: r.tier,
        exposure_direction: r.exposure_direction,
        business_segment: r.business_segment,
        role_reasoning: r.role_reasoning,
        evidence_event_ids: r.evidence_event_ids,
        confidence: r.confidence,
        sector: tickerSector.get(r.ticker_symbol) ?? null,
        skip_reason: r.skip_reason,
      }))
      const pass2 = await callSelfConsistencyPass({ theme: t, arch, recs: pass2Input, events })
      pass2Stats = pass2.stats
      const verdictMap = new Map(pass2.actions.map((a) => [a.ticker_symbol, a]))
      postPass2Rows = rowsToInsert.flatMap((r) => {
        const v = verdictMap.get(r.ticker_symbol)
        if (!v) {
          // No verdict returned — keep the row as a safety net.
          pass2Kept++
          return [r]
        }
        if (v.verdict === 'REMOVE') {
          pass2Removed++
          return []
        }
        if (v.verdict === 'REVISE') {
          pass2Revised++
          const newConf = typeof v.suggested_confidence === 'number'
            ? Math.max(0, Math.min(100, Math.round(v.suggested_confidence)))
            : r.confidence
          const caveat = v.suggested_caveat ? ` Note: ${v.suggested_caveat}` : ''
          return [{
            ...r,
            confidence: newConf,
            // Recompute confidence_band only when not already pre-flagged.
            confidence_band: r.confidence_band ?? (newConf < 50 ? 'low' : null),
            role_reasoning: caveat ? `${r.role_reasoning ?? ''}${caveat}`.slice(0, 800) : r.role_reasoning,
          }]
        }
        pass2Kept++
        return [r]
      })
      console.log(
        `  [pass2] theme=${t.id.slice(0, 8)} kept=${pass2Kept} revised=${pass2Revised} removed=${pass2Removed} cost=$${pass2.stats.cost_usd.toFixed(4)}`
      )
    } catch (err) {
      // Pass 2 failure shouldn't fail the whole theme. Log and continue.
      console.error(`  [pass2] theme=${t.id.slice(0, 8)} FAILED · ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const { error: delErr } = await supabaseAdmin
    .from('theme_recommendations')
    .delete()
    .eq('theme_id', t.id)
  if (delErr) {
    return {
      theme_id: t.id,
      theme_name: t.name,
      ok: false,
      error: `delete old: ${delErr.message}`,
      recommendations_inserted: 0,
      often_missed: 0,
      added_tickers: [],
      removed_tickers: [],
      stats: result.stats,
    }
  }

  // Deduplicate inserts on (theme_id, ticker_symbol) in case Sonnet returned duplicates.
  // Use the post-Pass 2 set so REMOVE verdicts and REVISE confidence/caveat
  // edits flow into the DB.
  const seen = new Set<string>()
  const deduped = postPass2Rows.filter((r) => {
    const key = r.ticker_symbol
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Recompute added/removed against the final inserted set so Pass 2 REMOVEs
  // are reflected in the run report.
  const finalSymbols = new Set(deduped.map((r) => r.ticker_symbol))
  const finalAdded = Array.from(finalSymbols).filter((s) => !priorSymbols.has(s))
  const finalRemoved = Array.from(new Set([...removed, ...added.filter((s) => !finalSymbols.has(s))]))

  const { error: insErr } = await supabaseAdmin.from('theme_recommendations').insert(deduped)
  if (insErr) {
    return {
      theme_id: t.id,
      theme_name: t.name,
      ok: false,
      error: `insert: ${insErr.message}`,
      recommendations_inserted: 0,
      often_missed: 0,
      added_tickers: [],
      removed_tickers: [],
      stats: result.stats,
    }
  }

  const { error: updThemeErr } = await supabaseAdmin
    .from('themes')
    .update({
      strategist_reflection: result.output.theme_reflection,
      strategist_reflection_zh: result.output.theme_reflection_zh,
      recent_drivers: result.output.recent_drivers,
      recent_drivers_generated_at: generatedAt,
      deep_generated_at: generatedAt,
    })
    .eq('id', t.id)
  if (updThemeErr) {
    // Recs inserted; reflection failed — still count as partial success.
    return {
      theme_id: t.id,
      theme_name: t.name,
      ok: true,
      error: `reflection update: ${updThemeErr.message}`,
      recommendations_inserted: deduped.length,
      often_missed: deduped.filter((r) => r.is_often_missed).length,
      added_tickers: finalAdded,
      removed_tickers: finalRemoved,
      sector_mismatches: sectorMismatchCount,
      sector_mismatches_high_conf: sectorMismatchHighConf,
      no_evidence_count: noEvidenceCount,
      hallucinated_event_count: hallucinatedEventCount,
      pass2_kept: pass2Kept,
      pass2_revised: pass2Revised,
      pass2_removed: pass2Removed,
      pass2_stats: pass2Stats,
      stats: result.stats,
    }
  }

  return {
    theme_id: t.id,
    theme_name: t.name,
    ok: true,
    recommendations_inserted: deduped.length,
    often_missed: deduped.filter((r) => r.is_often_missed).length,
    added_tickers: finalAdded,
    removed_tickers: finalRemoved,
    sector_mismatches: sectorMismatchCount,
    sector_mismatches_high_conf: sectorMismatchHighConf,
    no_evidence_count: noEvidenceCount,
    hallucinated_event_count: hallucinatedEventCount,
    pass2_kept: pass2Kept,
    pass2_revised: pass2Revised,
    pass2_removed: pass2Removed,
    pass2_stats: pass2Stats,
    stats: result.stats,
  }
}
