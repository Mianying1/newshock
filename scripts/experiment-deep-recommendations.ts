/**
 * Experiment · Ticker Recommendation Depth
 *
 * Pulls one active theme + its archetype playbook + recent events,
 * asks Sonnet to regenerate comprehensive 2nd-order recommendations,
 * and prints the before/after comparison to stdout.
 *
 * No DB writes. Run: npx tsx --env-file=.env.local scripts/experiment-deep-recommendations.ts
 */

import { supabaseAdmin } from '../lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '../lib/anthropic'

interface ThemeRow {
  id: string
  name: string
  summary: string | null
  status: string
  archetype_id: string | null
  event_count: number
}

interface ArchetypeRow {
  id: string
  name: string
  description: string | null
  category: string | null
  playbook: Record<string, unknown> | null
}

interface RecRow {
  ticker_symbol: string
  tier: number
  role_reasoning: string | null
  exposure_direction: string | null
}

interface EventRow {
  id: string
  headline: string
  source_name: string | null
  event_date: string
  mentioned_tickers: string[] | null
}

interface NewRecommendation {
  ticker: string
  company_name: string
  tier: 1 | 2 | 3
  direction: 'benefits' | 'headwind' | 'mixed'
  role: string
  business_exposure: string
  business_exposure_zh: string
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

interface DeepOutput {
  theme_reflection: string
  theme_reflection_zh: string
  recommendations: NewRecommendation[]
  tickers_removed_from_current: { ticker: string; why_removed: string }[]
  new_tickers_added: string[]
}

const PREFERRED_ARCHETYPES = (process.env.EXPERIMENT_ARCHETYPES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .concat([
    'stablecoin_regulation',
    'coinbase_payment_license',
    'middle_east_energy_shock',
  ])

async function pickExperimentTheme(): Promise<ThemeRow | null> {
  // First try the preferred archetypes; then fall back to any active theme
  // with ≥3 recommendations (best signal-to-noise for comparison).
  for (const archId of PREFERRED_ARCHETYPES) {
    const { data } = await supabaseAdmin
      .from('themes')
      .select('id, name, summary, status, archetype_id, event_count')
      .eq('archetype_id', archId)
      .eq('status', 'active')
      .order('event_count', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data as ThemeRow
  }

  // Fallback: most-active theme whose name mentions crypto/energy/stablecoin
  const { data: candidates } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, status, archetype_id, event_count')
    .eq('status', 'active')
    .order('event_count', { ascending: false })
    .limit(25)

  const rows = (candidates ?? []) as ThemeRow[]
  const keyword = rows.find((t) =>
    /coinbase|stablecoin|energy|oil|iran|middle east/i.test(t.name)
  )
  return keyword ?? rows[0] ?? null
}

function truncate(str: string | null | undefined, n: number): string {
  if (!str) return ''
  return str.length > n ? str.slice(0, n) + '…' : str
}

function summarizePlaybook(playbook: Record<string, unknown> | null): {
  thesis: string
  structural_differences: string
  historical_cases: string
  exit_signals: string
} {
  if (!playbook) {
    return {
      thesis: '(no playbook)',
      structural_differences: '',
      historical_cases: '',
      exit_signals: '',
    }
  }
  const pb = playbook as {
    thesis?: string
    this_time_different?: string | { summary?: string; bullets?: string[] }
    historical_cases?: { name: string; approximate_duration?: string; peak_move?: string }[]
    exit_signals?: (string | { name: string; description?: string })[]
  }

  const structural =
    typeof pb.this_time_different === 'string'
      ? pb.this_time_different
      : typeof pb.this_time_different === 'object' && pb.this_time_different
        ? [pb.this_time_different.summary, ...(pb.this_time_different.bullets ?? [])]
            .filter(Boolean)
            .join('\n  ')
        : ''

  const historical = (pb.historical_cases ?? [])
    .slice(0, 3)
    .map(
      (c) =>
        `- ${c.name}${c.approximate_duration ? ` (${c.approximate_duration})` : ''}${c.peak_move ? `: ${truncate(c.peak_move, 180)}` : ''}`
    )
    .join('\n')

  const exit = (pb.exit_signals ?? [])
    .slice(0, 6)
    .map((s) => (typeof s === 'string' ? `- ${s}` : `- ${s.name}${s.description ? `: ${truncate(s.description, 120)}` : ''}`))
    .join('\n')

  return {
    thesis: pb.thesis ?? '(inferred from theme description)',
    structural_differences: structural || '(none)',
    historical_cases: historical || '(none)',
    exit_signals: exit || '(none)',
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

  const eventsBlock = events
    .slice(0, 15)
    .map(
      (e) =>
        `- ${e.event_date.slice(0, 10)} · ${e.source_name ?? 'Press'} · ${e.headline}${e.mentioned_tickers?.length ? ` [tickers: ${e.mentioned_tickers.slice(0, 6).join(', ')}]` : ''}`
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
${pb.structural_differences}

HISTORICAL PLAYBOOK:
${pb.historical_cases}

EXIT SIGNALS:
${pb.exit_signals}

RECENT EVENTS (last 30 days, up to 15):
${eventsBlock || '(no recent events)'}

CURRENT RECOMMENDATIONS (for reference, we want to improve):
${currentBlock || '(none)'}

===

TASK:

Generate comprehensive ticker recommendations covering the FULL 2nd-order network.

Think through these layers:

1. DIRECT BENEFICIARIES (Tier 1)
   - Pure plays with 70%+ revenue from theme
   - Who are the 3-5 most obvious winners?

2. INDIRECT BENEFICIARIES (Tier 2)
   - Suppliers, infrastructure, enablers
   - Who benefits from the winners winning?

3. PERIPHERAL (Tier 3)
   - Second-order, sentiment beneficiaries
   - Who gets dragged up but isn't core?

4. HEADWINDS (Downside)
   - Who loses from this theme?
   - Substitutes, competitors, disrupted incumbents

5. HIDDEN ANGLES (Often missed)
   - Foreign ADRs, obscure small caps
   - Convertibles on small-cap pure plays
   - REITs/ETFs structurally exposed
   - Private market proxies (public parent companies)

For each ticker, provide:
- Why they're in this tier
- Specific business exposure
- What catalyst would make them move
- What would break the thesis for them

Aim for 15-25 tickers total. Not 5 obvious ones.

Include:
- US + major ADRs (Canada, UK, Japan, Europe)
- Range of market caps (small + mid + large)
- Mix pure play + diversified (label clearly)

===

OUTPUT (valid JSON only, no markdown):

{
  "theme_reflection": "2-3 sentences: your overall take on this theme's conviction and current positioning opportunity",
  "theme_reflection_zh": "中文版",
  "recommendations": [
    {
      "ticker": "TICKER",
      "company_name": "Company Name",
      "tier": 1,
      "direction": "benefits|headwind|mixed",
      "role": "pure_play_beneficiary|infrastructure_enabler|...",
      "business_exposure": "What % of business aligns with theme, be specific",
      "business_exposure_zh": "中文",
      "reasoning": "Why this ticker, 2-3 specific sentences",
      "reasoning_zh": "中文",
      "catalyst": "What event would make it move",
      "catalyst_zh": "中文",
      "risk": "What would break this thesis for this ticker",
      "risk_zh": "中文",
      "market_cap_band": "small|mid|large",
      "is_pure_play": true,
      "is_often_missed": false,
      "confidence": 80
    }
  ],
  "tickers_removed_from_current": [
    { "ticker": "X", "why_removed": "reasoning" }
  ],
  "new_tickers_added": ["TICKER1", "TICKER2"]
}

Target: 15-20 total recommendations (strict — max_tokens=6000).
Quality > Quantity. If only 12 make sense, return 12.

Length budget (HARD limits — enforce or JSON truncates):
- reasoning / reasoning_zh: ≤ 140 chars each, 1 sentence
- business_exposure / _zh: ≤ 90 chars
- catalyst / _zh, risk / _zh: ≤ 80 chars each
- theme_reflection / _zh: ≤ 280 chars each

Return ONLY valid JSON, no markdown, no trailing commentary.`
}

function parseJson(text: string): DeepOutput {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0]) as DeepOutput
    } catch {
      // Fall through to lenient recovery.
    }
  }

  // Lenient recovery for truncated responses: keep whole `recommendations`
  // objects up to the last balanced `}` inside the array, then close the JSON.
  const reflection = cleaned.match(/"theme_reflection"\s*:\s*"([^"\\]|\\.)*"/)
  const reflectionZh = cleaned.match(/"theme_reflection_zh"\s*:\s*"([^"\\]|\\.)*"/)
  const recsStart = cleaned.indexOf('"recommendations"')
  const arrStart = recsStart >= 0 ? cleaned.indexOf('[', recsStart) : -1
  if (arrStart < 0) {
    throw new Error('Could not find recommendations array in Sonnet response')
  }
  const recs: unknown[] = []
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
    if (depth !== 0) break // truncated object — drop it
    const slice = cleaned.slice(start, i)
    try {
      recs.push(JSON.parse(slice))
    } catch {
      break
    }
  }

  return {
    theme_reflection: reflection ? JSON.parse(`"${reflection[0].split(/"\s*:\s*"/)[1]}`) : '',
    theme_reflection_zh: reflectionZh
      ? JSON.parse(`"${reflectionZh[0].split(/"\s*:\s*"/)[1]}`)
      : '',
    recommendations: recs as NewRecommendation[],
    tickers_removed_from_current: [],
    new_tickers_added: [],
  }
}

function tokenCost(input: number, output: number): number {
  // Sonnet 4.5 list pricing: $3 / Mtok input, $15 / Mtok output
  return (input * 3 + output * 15) / 1_000_000
}

async function main() {
  const theme = await pickExperimentTheme()
  if (!theme) {
    console.error('No suitable active theme found. Aborting.')
    process.exit(1)
  }

  console.log('=== Experiment · Deep Recommendations ===')
  console.log(`Theme:        ${theme.name}`)
  console.log(`Theme id:     ${theme.id}`)
  console.log(`Archetype id: ${theme.archetype_id ?? '(none)'}`)
  console.log(`Event count:  ${theme.event_count}\n`)

  const [archRes, recsRes, eventsRes] = await Promise.all([
    theme.archetype_id
      ? supabaseAdmin
          .from('theme_archetypes')
          .select('id, name, description, category, playbook')
          .eq('id', theme.archetype_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from('theme_recommendations')
      .select('ticker_symbol, tier, role_reasoning, exposure_direction')
      .eq('theme_id', theme.id)
      .order('tier'),
    supabaseAdmin
      .from('events')
      .select('id, headline, source_name, event_date, mentioned_tickers')
      .eq('trigger_theme_id', theme.id)
      .gte('event_date', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order('event_date', { ascending: false })
      .limit(30),
  ])

  const arch = (archRes.data ?? null) as ArchetypeRow | null
  const currentRecs = (recsRes.data ?? []) as RecRow[]
  const events = (eventsRes.data ?? []) as EventRow[]

  console.log(`Current recommendations: ${currentRecs.length}`)
  console.log(`Events (30d, matched to theme): ${events.length}\n`)

  const prompt = buildPrompt({ theme, arch, currentRecs, events })

  const started = Date.now()
  process.stderr.write(`[${new Date().toISOString()}] calling Sonnet (streaming, max_tokens=6000)…\n`)

  const stream = anthropic.messages.stream({
    model: MODEL_SONNET,
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  })
  let text = ''
  let charsSinceLog = 0
  const heartbeat = setInterval(() => {
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    process.stderr.write(`[${secs}s] streamed ${text.length} chars so far…\n`)
  }, 15_000)
  stream.on('text', (delta) => {
    text += delta
    charsSinceLog += delta.length
    if (charsSinceLog >= 500) {
      process.stderr.write(`  +${charsSinceLog} chars (total ${text.length})\n`)
      charsSinceLog = 0
    }
  })
  const final = await stream.finalMessage()
  clearInterval(heartbeat)
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)
  process.stderr.write(`[${elapsedSec}s] stream ended, stop_reason=${final.stop_reason}\n\n`)

  const usage = final.usage
  const inputTokens = usage?.input_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0
  const cost = tokenCost(inputTokens, outputTokens)

  console.log(`Sonnet call: ${elapsedSec}s · input ${inputTokens} tok · output ${outputTokens} tok · cost $${cost.toFixed(4)}\n`)

  let out: DeepOutput
  try {
    out = parseJson(text)
  } catch (e) {
    console.error('Failed to parse Sonnet response:', e)
    console.log('--- raw ---')
    console.log(text.slice(0, 2000))
    process.exit(1)
  }

  const currentSet = new Set(currentRecs.map((r) => r.ticker_symbol))
  const newSet = new Set(out.recommendations.map((r) => r.ticker))
  const added = [...newSet].filter((t) => !currentSet.has(t))
  const removed = [...currentSet].filter((t) => !newSet.has(t))

  const byTier = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
  let headwinds = 0
  let oftenMissed = 0
  const capBand = { small: 0, mid: 0, large: 0 } as Record<string, number>
  let purePlay = 0

  for (const r of out.recommendations) {
    byTier[r.tier] = (byTier[r.tier] ?? 0) + 1
    if (r.direction === 'headwind' || r.direction === 'mixed') headwinds++
    if (r.is_often_missed) oftenMissed++
    capBand[r.market_cap_band] = (capBand[r.market_cap_band] ?? 0) + 1
    if (r.is_pure_play) purePlay++
  }

  console.log('--- REFLECTION ---')
  console.log('EN:', out.theme_reflection)
  console.log('ZH:', out.theme_reflection_zh)
  console.log()

  console.log('--- COMPARISON ---')
  console.log(`Current tickers:       ${currentRecs.length}`)
  console.log(`New tickers:           ${out.recommendations.length}`)
  console.log(`  · Tier 1: ${byTier[1]} · Tier 2: ${byTier[2]} · Tier 3: ${byTier[3]}`)
  console.log(`  · Cap mix: small ${capBand.small ?? 0} / mid ${capBand.mid ?? 0} / large ${capBand.large ?? 0}`)
  console.log(`  · Pure play: ${purePlay} · Headwinds: ${headwinds} · Often-missed: ${oftenMissed}`)
  console.log(`Added (${added.length}):   ${added.join(', ') || '(none)'}`)
  console.log(`Removed (${removed.length}): ${removed.join(', ') || '(none)'}`)
  console.log()

  console.log('--- FULL NEW RECOMMENDATIONS ---')
  for (const r of out.recommendations) {
    const flags = [
      r.is_pure_play ? 'pure' : 'div',
      r.market_cap_band,
      r.is_often_missed ? 'often-missed' : null,
    ]
      .filter(Boolean)
      .join(' · ')
    console.log(
      `T${r.tier} ${r.direction.padEnd(8)} ${r.ticker.padEnd(7)} ${r.company_name.slice(0, 30).padEnd(30)} [${flags}] conf=${r.confidence}`
    )
    console.log(`    role: ${r.role}`)
    console.log(`    exposure: ${truncate(r.business_exposure, 180)}`)
    console.log(`    why: ${truncate(r.reasoning, 220)}`)
    console.log(`    catalyst: ${truncate(r.catalyst, 160)}`)
    console.log(`    risk: ${truncate(r.risk, 160)}`)
    console.log()
  }

  console.log('--- DEEP REASONING SAMPLES (3 picks) ---')
  const samples = [
    out.recommendations.find((r) => r.is_often_missed),
    out.recommendations.find((r) => r.direction === 'headwind'),
    out.recommendations.find((r) => r.tier === 1 && r.is_pure_play),
  ].filter((r): r is NewRecommendation => Boolean(r))

  for (const r of samples) {
    console.log(`\n[${r.ticker}] ${r.company_name} · T${r.tier} · ${r.direction}`)
    console.log('  EN reasoning:', r.reasoning)
    console.log('  ZH reasoning:', r.reasoning_zh)
    console.log('  EN exposure :', r.business_exposure)
    console.log('  ZH exposure :', r.business_exposure_zh)
    console.log('  EN catalyst :', r.catalyst)
    console.log('  EN risk     :', r.risk)
  }

  console.log('\n--- REMOVED FROM CURRENT (Sonnet reasoning) ---')
  for (const r of out.tickers_removed_from_current ?? []) {
    console.log(`- ${r.ticker}: ${r.why_removed}`)
  }

  console.log('\n--- QUALITY SCORECARD ---')
  const checks = [
    { name: 'tickers ≥ 15', ok: out.recommendations.length >= 15 },
    { name: 'has often-missed', ok: oftenMissed > 0 },
    { name: 'has small + diversified', ok: (capBand.small ?? 0) > 0 && purePlay < out.recommendations.length },
    { name: 'has headwind/mixed', ok: headwinds > 0 },
    { name: 'zh translations filled', ok: out.recommendations.every((r) => r.reasoning_zh && r.reasoning_zh.length > 10) },
    { name: 'theme_reflection bilingual', ok: Boolean(out.theme_reflection && out.theme_reflection_zh) },
  ]
  let pass = 0
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}`)
    if (c.ok) pass++
  }
  console.log(`\nVerdict: ${pass}/6 ${pass >= 4 ? '→ experiment SUCCESS, ready for rollout' : '→ tune prompt and re-run'}`)
  console.log(`Cost this run: $${cost.toFixed(4)} · extrapolated 50 themes: $${(cost * 50).toFixed(2)}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('experiment failed:', e)
    process.exit(1)
  })
