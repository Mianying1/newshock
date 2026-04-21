import { config } from 'dotenv'
config({ path: '.env.localc' })

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const MODEL_SONNET = 'claude-sonnet-4-6'

// ─── Full system prompt (mirrors lib/theme-generator.ts SYSTEM_PROMPT) ────────

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
- Can plausibly move the stock price of at least 1 company by 3%+
- Creates a new narrative that could emerge as a theme
- Is a measurable catalyst with concrete dollar amounts, dates, or parties
- Changes the competitive positioning or supply chain of a sector

If Step 1 = NOT INVESTABLE → action = "irrelevant". STOP.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — ARCHETYPE MATCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Check the provided ARCHETYPES. Use trigger_keywords as matching signal.
If Step 2 = "none" → action = "new_exploratory". MANDATORY.
Bias: When archetype confidence is 55-70, prefer new_exploratory.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — EXISTING THEME CONSOLIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use strengthen_existing only if ALL hold: same archetype_id, last_active_at within 14 days, same situation, news adds new info.

TICKER SELECTION: Prefer TICKERS DATABASE. For out-of-DB suggestions mark [OUT_OF_DB] in ticker_reasoning.

Return ONLY valid JSON. No markdown.`

// ─── Testbed ──────────────────────────────────────────────────────────────────

const GROUP_A_IRRELEVANT = [
  {
    label: 'A1. Entertainment',
    headline: 'Taylor Swift announces Eras Tour 2027 dates',
    raw_content: 'Pop star Taylor Swift announced new dates for her record-breaking Eras Tour, set to resume in 2027. The tour previously grossed over $1 billion, making it the highest-grossing concert tour in history. New cities include Tokyo, São Paulo, and Dubai.',
    expected_s0: 'no',
  },
  {
    label: 'A2. Pure politics',
    headline: 'Former president makes campaign speech in Iowa calling for border security',
    raw_content: 'Speaking to thousands of supporters in Des Moines, the former president outlined his immigration policy platform ahead of the primaries. The rally focused on border security, trade tariffs rhetoric, and federal spending cuts. No specific policy proposals or legislation was announced.',
    expected_s0: 'no',
  },
  {
    label: 'A3. Sports',
    headline: 'NFL ratings up 5% YoY for Week 12, driven by prime-time matchups',
    raw_content: 'The NFL announced that Week 12 viewership averaged 23 million viewers across all broadcasts, up 5% from the same period last year. The Thursday Night Football game between Dallas and Philadelphia drew 28 million viewers, the highest of the season.',
    expected_s0: 'no',
  },
  {
    label: 'A4. Small-cap personnel',
    headline: 'CEO of XYZ Corp ($200M market cap) announces resignation',
    raw_content: 'XYZ Corp, a small software company with $200M market cap, announced CEO John Smith will step down after 3 years. The board named CFO Jane Doe as interim CEO while conducting a search. No financial guidance changes were provided.',
    expected_s0: 'no',
  },
]

const GROUP_B_RELEVANT = [
  {
    label: 'B1. Agriculture',
    headline: 'Nutrien reports record Q1 potash demand, raises 2026 guidance by 18%',
    raw_content: 'Nutrien announced Q1 results showing potash demand hit record 13.5M tonnes, driven by restocking cycles in Brazil and India. CEO raised 2026 EBITDA guidance to $7.2B, 18% above consensus. Phosphate shipments also rose 12% as India increased subsidy coverage. Competitors MOS, CF cited similar demand.',
    expected_s0: 'yes',
    expected_action: 'new_exploratory',
  },
  {
    label: 'B2. Pharma GLP-1',
    headline: 'Novo Nordisk Wegovy gains FDA cardiovascular indication',
    raw_content: 'The FDA approved expanded Wegovy label to include prevention of cardiovascular events in adults with obesity. This opens potential Medicare coverage. Analysts at JPM raise Novo peak sales estimate to $28B from $22B.',
    expected_s0: 'yes',
    expected_action: 'new_exploratory',
  },
  {
    label: 'B3. Defense',
    headline: 'Raytheon wins $4B Patriot missile contract from Saudi Arabia',
    raw_content: 'RTX announced the US government approved a $4B foreign military sale to Saudi Arabia for Patriot PAC-3 systems. Lockheed Martin produces the PAC-3 missile under subcontract, Northrop Grumman provides radar. Delivery expected 2027-2029.',
    expected_s0: 'yes',
    expected_action: 'new_exploratory',
  },
  {
    label: 'B4. Cannabis',
    headline: 'DEA officially reschedules marijuana to Schedule III, effective Oct 2026',
    raw_content: 'The DEA announced marijuana reclassification from Schedule I to Schedule III, effective October 1, 2026. Cannabis companies will now access normal banking and deduct ordinary business expenses (280E eliminated). Analysts at Cowen expect $30B in institutional capital inflow.',
    expected_s0: 'yes',
    expected_action: 'new_exploratory',
  },
  {
    label: 'B5. Shipping',
    headline: 'Red Sea container shipping rates spike 340% as Houthi attacks resume',
    raw_content: 'Container shipping rates from Asia to Europe surged 340% week-over-week. Shanghai-Rotterdam spot rates hit $8,900 per 40-foot container. Maersk and Hapag-Lloyd announced surcharges. Ocean Network Express rerouted 15 vessels around Cape of Good Hope.',
    expected_s0: 'yes',
    expected_action: 'new_exploratory',
  },
  {
    label: 'B6. Satellite IoT',
    headline: 'Spire Global raises $150M Series D for satellite IoT, targets $5B TAM',
    raw_content: 'Spire Global (SPIR) announced $150M Series D funding led by Morgan Stanley, bringing total funding to $500M. The company operates 150+ LEO satellites providing IoT data for maritime tracking, weather, and aviation. CEO says TAM is $5B by 2030. Competitors include Iridium Communications (IRDM).',
    expected_s0: 'yes',
    expected_action: 'new_exploratory',
  },
]

// ─── Sonnet call ──────────────────────────────────────────────────────────────

async function runSonnet(
  headline: string,
  raw_content: string,
  ctx: { archetypesText: string; activeThemesText: string; tickersText: string }
): Promise<{ result: Record<string, unknown>; output_tokens: number }> {
  const cachedContext =
    `ARCHETYPES:\n${ctx.archetypesText}\n\n` +
    `ACTIVE_THEMES:\n${ctx.activeThemesText}\n\n` +
    `TICKERS DATABASE:\n${ctx.tickersText}`

  const newsBlock =
    `NEWS:\nHeadline: ${headline}\nContent: ${raw_content.slice(0, 1500)}\n\n` +
    `Return JSON with this schema:\n` +
    `{ "decision_trace": { "step0_relevant": "yes"|"no", "step0_reason": "...", "step1_investable": "yes"|"no"|"n/a", "step1_reason": "...", "step2_archetype_match": "exact"|"partial"|"none"|"n/a", "step2_archetype_id": null, "step3_existing_theme": "n/a", "step3_theme_id": null }, ` +
    `"action": "strengthen_existing"|"new_from_archetype"|"new_exploratory"|"irrelevant", ` +
    `"target_theme_id": null, "archetype_id": null, "theme_name": null, "theme_summary": null, ` +
    `"classification_confidence": 0, "suggested_tickers": { "tier1": [], "tier2": [], "tier3": [] }, ` +
    `"ticker_reasoning": {}, "reasoning": "...", "why_exploratory_not_strengthen": null }`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1500,
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
  const result = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
  return { result, output_tokens: msg.usage.output_tokens }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { getMatcherContext } = await import('@/lib/theme-matcher')
  console.log('Loading matcher context...')
  const ctx = await getMatcherContext()
  console.log(`Loaded: ${ctx.archetypes.length} archetypes, ${ctx.activeThemes.length} active themes, ${ctx.availableTickers.length} tickers\n`)

  const tokenLog: { label: string; group: string; output_tokens: number; action: string; s0: string }[] = []

  // ── Group A: should all be irrelevant ──────────────────────────────────────
  console.log('═'.repeat(68))
  console.log('GROUP A — Expected: irrelevant (step0_relevant = "no")')
  console.log('═'.repeat(68))

  for (const test of GROUP_A_IRRELEVANT) {
    const { result, output_tokens } = await runSonnet(test.headline, test.raw_content, ctx)
    const r = result as { action: string; decision_trace: { step0_relevant: string; step0_reason: string } }
    const s0 = r.decision_trace?.step0_relevant ?? '?'
    const s0ok = s0 === test.expected_s0
    const actionOk = r.action === 'irrelevant'
    console.log(`\n${test.label}`)
    console.log(`  step0_relevant=${s0} (${s0ok ? '✅' : '❌'}) | action=${r.action} (${actionOk ? '✅' : '❌'}) | tokens=${output_tokens}`)
    console.log(`  reason: ${r.decision_trace?.step0_reason ?? r.action}`)
    tokenLog.push({ label: test.label, group: 'A', output_tokens, action: r.action, s0 })
  }

  // ── Group B: should all be relevant ───────────────────────────────────────
  console.log('\n' + '═'.repeat(68))
  console.log('GROUP B — Expected: relevant (step0_relevant = "yes")')
  console.log('═'.repeat(68))

  for (const test of GROUP_B_RELEVANT) {
    const { result, output_tokens } = await runSonnet(test.headline, test.raw_content, ctx)
    const r = result as {
      action: string
      decision_trace: { step0_relevant: string; step0_reason: string }
      theme_name: string
      suggested_tickers: { tier1: string[]; tier2: string[] }
      classification_confidence: number
    }
    const s0 = r.decision_trace?.step0_relevant ?? '?'
    const s0ok = s0 === test.expected_s0
    const actionOk = r.action !== 'irrelevant'
    console.log(`\n${test.label}`)
    console.log(`  step0_relevant=${s0} (${s0ok ? '✅' : '❌'}) | action=${r.action} (${actionOk ? '✅' : '❌'}) | tokens=${output_tokens}`)
    console.log(`  theme: "${r.theme_name ?? '—'}" conf=${r.classification_confidence}`)
    console.log(`  tier1: [${r.suggested_tickers?.tier1?.join(', ') ?? ''}]`)
    tokenLog.push({ label: test.label, group: 'B', output_tokens, action: r.action, s0 })
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(68))
  console.log('SUMMARY')
  console.log('─'.repeat(68))

  const groupA = tokenLog.filter(t => t.group === 'A')
  const groupB = tokenLog.filter(t => t.group === 'B')
  const avgA = Math.round(groupA.reduce((s, t) => s + t.output_tokens, 0) / groupA.length)
  const avgB = Math.round(groupB.reduce((s, t) => s + t.output_tokens, 0) / groupB.length)

  const aPass = groupA.filter(t => t.action === 'irrelevant').length
  const bPass = groupB.filter(t => t.action !== 'irrelevant').length
  console.log(`Group A (irrelevant): ${aPass}/${groupA.length} correct | avg output tokens: ${avgA}`)
  console.log(`Group B (relevant):   ${bPass}/${groupB.length} correct | avg output tokens: ${avgB}`)

  console.log('\nToken detail:')
  tokenLog.forEach(t => console.log(`  ${t.label.padEnd(35)} action=${t.action.padEnd(22)} tokens=${t.output_tokens}`))

  // Cost estimate
  // 900 events/month; assume ~30% irrelevant (short response), ~70% relevant (full response)
  // Input: ~9k tokens cached + ~500 uncached per event ≈ $0.014/event at cache-hit rate
  // But irrelevant events return ~50 output tokens vs ~600 for relevant
  const irrelevantFraction = 0.30
  const relevantFraction = 0.70
  const eventsPerMonth = 900
  const inputCostPerEvent = 0.014 // Sonnet cache-hit estimate
  const outputCostIrrelevant = (avgA / 1000000) * 15  // Sonnet output: $15/M tokens
  const outputCostRelevant = (avgB / 1000000) * 15
  const monthlyInputCost = eventsPerMonth * inputCostPerEvent
  const monthlyOutputCost = eventsPerMonth * (
    irrelevantFraction * outputCostIrrelevant +
    relevantFraction * outputCostRelevant
  )
  const monthlyTotal = monthlyInputCost + monthlyOutputCost

  console.log('\nCost estimate (900 events/month, 30% irrelevant / 70% relevant):')
  console.log(`  Input (all Sonnet, cache-hit): $${monthlyInputCost.toFixed(2)}/month`)
  console.log(`  Output (avg irrel=${avgA}tok, rel=${avgB}tok): $${monthlyOutputCost.toFixed(2)}/month`)
  console.log(`  TOTAL: ~$${monthlyTotal.toFixed(2)}/month`)
  console.log(`  (Previous 2-call estimate: ~$${(900 * (0.014 + 0.0006)).toFixed(2)}/month — now ~same cost but 1 fewer API call)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
