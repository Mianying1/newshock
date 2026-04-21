import { config } from 'dotenv'
config({ path: '.env.localc' })

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const MODEL_HAIKU = 'claude-haiku-4-5-20251001'
const MODEL_SONNET = 'claude-sonnet-4-6'

// ─── Testbed ──────────────────────────────────────────────────────────────────

const TESTBED = [
  {
    label: '1. Agriculture',
    headline: 'Nutrien reports record Q1 potash demand, raises 2026 guidance by 18%',
    raw_content: 'Nutrien announced Q1 results showing potash demand hit record 13.5M tonnes, driven by restocking cycles in Brazil and India. CEO raised 2026 EBITDA guidance to $7.2B, 18% above consensus. Phosphate shipments also rose 12% as India increased subsidy coverage. Competitors MOS, CF cited similar demand.',
    expected_action: 'new_exploratory',
    expected_tickers: ['NTR', 'MOS', 'CF'],
  },
  {
    label: '2. Pharma GLP-1',
    headline: 'Novo Nordisk Wegovy gains FDA cardiovascular indication',
    raw_content: 'The FDA approved expanded Wegovy label to include prevention of cardiovascular events in adults with obesity. This opens potential Medicare coverage. Analysts at JPM raise Novo peak sales estimate to $28B from $22B.',
    expected_action: 'new_exploratory',
    expected_tickers: ['NVO', 'LLY'],
  },
  {
    label: '3. Defense',
    headline: 'Raytheon wins $4B Patriot missile contract from Saudi Arabia',
    raw_content: 'RTX announced the US government approved a $4B foreign military sale to Saudi Arabia for Patriot PAC-3 systems and associated components. This is the largest Patriot export deal since 2023. Lockheed Martin produces the PAC-3 missile under subcontract, Northrop Grumman provides radar. Delivery expected 2027-2029.',
    expected_action: 'new_exploratory',
    expected_tickers: ['RTX', 'LMT', 'NOC'],
  },
  {
    label: '4. Cannabis',
    headline: 'DEA officially reschedules marijuana to Schedule III, effective Oct 2026',
    raw_content: 'The DEA announced marijuana reclassification from Schedule I to Schedule III, effective October 1, 2026. Cannabis companies will now access normal banking and deduct ordinary business expenses (previously blocked under 280E). Analysts at Cowen expect $30B in institutional capital inflow.',
    expected_action: 'new_exploratory',
    expected_tickers: ['MSOS', 'CGC', 'TLRY'],
  },
  {
    label: '5. Shipping',
    headline: 'Red Sea container shipping rates spike 340% as Houthi attacks resume',
    raw_content: 'Container shipping rates from Asia to Europe surged 340% week-over-week. Shanghai-Rotterdam spot rates hit $8,900 per 40-foot container. Maersk and Hapag-Lloyd announced surcharges. Ocean Network Express rerouted 15 vessels around Cape of Good Hope.',
    expected_action: 'new_exploratory',
    expected_tickers: ['ZIM', 'MATX'],
  },
  {
    label: '6. Satellite IoT (out-of-DB discovery)',
    headline: 'Spire Global raises $150M Series D for satellite IoT, targets $5B TAM',
    raw_content: 'Spire Global (SPIR) announced $150M Series D funding led by Morgan Stanley, bringing total funding to $500M. The company operates 150+ LEO satellites providing IoT data for maritime tracking, weather, and aviation. CEO says TAM is $5B by 2030. Competitors include Iridium Communications (IRDM) and Maxar Technologies (former MAXR).',
    expected_action: 'new_exploratory',
    expected_tickers: ['SPIR', 'IRDM'],
    expect_out_of_db: true,
  },
]

// ─── Haiku filter ─────────────────────────────────────────────────────────────

async function testHaiku(headline: string, snippet: string): Promise<{ relevant: boolean; reason: string }> {
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
  const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
  return { relevant: Boolean(json.relevant), reason: String(json.reason ?? '') }
}

// ─── Sonnet ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Theme Identification engine for Newshock, a thematic investing intelligence tool.

Follow this 3-step decision process in order. Record your reasoning in decision_trace.

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
Check the provided ARCHETYPES. Use trigger_keywords as matching signal.
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

Examples: agriculture guidance raise → new_exploratory (no agri archetype);
GLP-1 FDA approval → new_exploratory (no pharma archetype);
defense contract → new_exploratory (no defense archetype).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — EXISTING THEME CONSOLIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If Step 2 found a match, check ACTIVE_THEMES for an existing theme.
Use strengthen_existing only if ALL hold:
  ✓ Active theme has SAME archetype_id
  ✓ last_active_at within 14 days
  ✓ Same ongoing situation (same country/entity/event chain)
  ✓ News adds new information (not a duplicate)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TICKER SELECTION POLICY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Primary: Prefer tickers from the TICKERS DATABASE provided.
These are vetted tickers with known metadata.

Secondary (discovery): If the DATABASE lacks obvious beneficiary tickers
for this theme, you MAY suggest tickers outside the database. These are
exploratory suggestions and will be logged for weekly review.

Rules for out-of-DB suggestions:
- Must be a real, actively-traded US-listed ticker (NYSE or NASDAQ)
- Must be a ticker you are highly confident exists (not fabricated)
- Mark them in ticker_reasoning with a [OUT_OF_DB] prefix
  Example: "SPIR": "[OUT_OF_DB] Spire Global operates 150+ LEO satellites, direct beneficiary"
- Do NOT suggest delisted / bankrupt / OTC pink sheet tickers
- When in doubt about whether a ticker exists, omit it

Rule of thumb: DB-first. Only use out-of-DB when theme is clearly in a
sector the DB doesn't cover.

Return ONLY valid JSON. No markdown, no text outside JSON.`

async function testSonnet(
  headline: string,
  raw_content: string,
  ctx: { archetypesText: string; activeThemesText: string; tickersText: string }
): Promise<Record<string, unknown>> {
  const cachedContext =
    `ARCHETYPES:\n${ctx.archetypesText}\n\n` +
    `ACTIVE_THEMES:\n${ctx.activeThemesText}\n\n` +
    `TICKERS DATABASE (prefer symbols from this list):\n${ctx.tickersText}`

  const newsBlock =
    `NEWS:\nHeadline: ${headline}\nContent: ${raw_content.slice(0, 1500)}\n\n` +
    `Return JSON matching this schema exactly:\n` +
    `{\n` +
    `  "decision_trace": { "step1_investable": "yes"|"no", "step1_reason": "...", "step2_archetype_match": "exact"|"partial"|"none", "step2_archetype_id": null, "step3_existing_theme": "n/a", "step3_theme_id": null },\n` +
    `  "action": "strengthen_existing"|"new_from_archetype"|"new_exploratory"|"irrelevant",\n` +
    `  "target_theme_id": null,\n` +
    `  "archetype_id": null,\n` +
    `  "theme_name": string|null,\n` +
    `  "theme_summary": string|null,\n` +
    `  "classification_confidence": 0-100,\n` +
    `  "suggested_tickers": { "tier1": [], "tier2": [], "tier3": [] },\n` +
    `  "ticker_reasoning": { "TICKER": "causal role — use [OUT_OF_DB] prefix if not in DATABASE" },\n` +
    `  "reasoning": "one sentence",\n` +
    `  "why_exploratory_not_strengthen": null\n` +
    `}`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1000,
    temperature: 0,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: cachedContext, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: newsBlock },
      ],
    }],
  })

  const text = (msg.content[0] as { type: string; text: string }).text.trim()
  return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { getMatcherContext } = await import('@/lib/theme-matcher')
  console.log('Loading matcher context from Supabase...')
  const ctx = await getMatcherContext()
  console.log(`Loaded: ${ctx.archetypes.length} archetypes, ${ctx.activeThemes.length} active themes\n`)

  const results: Array<{ label: string; haiku: boolean; action: string; tier1: string[]; tier2: string[]; outOfDb: string[] }> = []

  for (const test of TESTBED) {
    console.log(`\n${'═'.repeat(68)}`)
    console.log(`TEST ${test.label}`)
    console.log(`Headline: ${test.headline}`)
    console.log('─'.repeat(68))

    const haiku = await testHaiku(test.headline, test.raw_content)
    console.log(`[HAIKU] relevant=${haiku.relevant} | ${haiku.reason.slice(0, 100)}`)

    if (!haiku.relevant) {
      console.log('⚠️  HAIKU FILTERED — expected relevant!')
      results.push({ label: test.label, haiku: false, action: 'FILTERED', tier1: [], tier2: [], outOfDb: [] })
      continue
    }

    const sonnet = await testSonnet(test.headline, test.raw_content, ctx) as {
      action: string
      suggested_tickers: { tier1: string[]; tier2: string[]; tier3: string[] }
      ticker_reasoning: Record<string, string>
      theme_name: string
      classification_confidence: number
      reasoning: string
    }

    const tier1 = sonnet.suggested_tickers?.tier1 ?? []
    const tier2 = sonnet.suggested_tickers?.tier2 ?? []
    const outOfDb = Object.entries(sonnet.ticker_reasoning ?? {})
      .filter(([, r]) => /^\[OUT_OF_DB\]/i.test(r))
      .map(([sym]) => sym)

    console.log(`[SONNET] action=${sonnet.action} conf=${sonnet.classification_confidence}`)
    console.log(`  theme_name: "${sonnet.theme_name}"`)
    console.log(`  tier1: [${tier1.join(', ')}]`)
    console.log(`  tier2: [${tier2.join(', ')}]`)
    console.log(`  [OUT_OF_DB]: [${outOfDb.join(', ')}]`)
    console.log(`  reasoning: ${sonnet.reasoning}`)

    const allTickers = [...tier1, ...tier2, ...(sonnet.suggested_tickers?.tier3 ?? [])]
    const expectedHit = test.expected_tickers.filter(t => allTickers.includes(t))
    const actionOk = sonnet.action === test.expected_action
    const tickersOk = expectedHit.length === test.expected_tickers.length
    const outOfDbOk = !test.expect_out_of_db || outOfDb.length > 0

    console.log(`\n  [VERDICT] action: ${actionOk ? '✅' : '❌'} (${sonnet.action}) | tickers: ${tickersOk ? '✅' : '⚠️'} found ${expectedHit.join(',')||'none'}/${test.expected_tickers.join(',')} | out-of-db: ${outOfDbOk ? '✅' : '⚠️'} [${outOfDb.join(', ')||'none'}]`)

    results.push({ label: test.label, haiku: haiku.relevant, action: sonnet.action, tier1, tier2, outOfDb })
  }

  console.log(`\n${'═'.repeat(68)}`)
  console.log('SUMMARY')
  console.log('─'.repeat(68))
  results.forEach(r => {
    console.log(`  ${r.label}`)
    console.log(`    action=${r.action} | tier1=[${r.tier1.join(',')}] | out-of-db=[${r.outOfDb.join(',')}]`)
  })

  console.log('\nTest run complete. Review before running on live events.')
}

main().catch((e) => { console.error(e); process.exit(1) })
