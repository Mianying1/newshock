/**
 * Temp A/B test · 20 SEC 8-K events · Haiku (DB) vs Sonnet (re-run with same prompt).
 * Read-only: does NOT touch DB. Prints comparison table only.
 *
 * Run: npx tsx scripts/test-sec-8k-sonnet.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const SYSTEM_PROMPT = `You are a specialist classifier for SEC 8-K filings.

A filing is relevant to thematic investing ONLY IF the material item points to a development that plausibly connects to one of the provided investment archetypes. Most 8-K filings are routine corporate housekeeping and should be marked irrelevant.

Return JSON only:
{
  "action": "irrelevant" | "match_archetype" | "exploratory",
  "archetype_id": "string or null",
  "reasoning": "1 short English sentence",
  "reasoning_zh": "1 句中文简短描述"
}

Rules:
- "match_archetype": the filing is a material corporate event (1.01/2.01/7.01/8.01/etc.) that plausibly strengthens an existing archetype. Set archetype_id.
- "exploratory": material event but no archetype fits well. archetype_id = null.
- "irrelevant": routine (5.02 executive change, 2.02 pure earnings, 5.03 bylaws, 5.07 shareholder vote, 9.01 exhibits-only, 3.02 stock issuance that is not major) OR material but not thematically relevant (e.g., small-cap single-company debt restructuring).
- A mega-cap issuer with a non-routine item that could hint at broader theme (e.g., Apple 1.01 with a supplier) can still be exploratory.
- reasoning_zh: accurate Chinese translation using standard finance terminology (如 "物料事件" "暴露" "利好" "承压"). Preserve tickers/CIK/years unchanged.`

async function main() {
  const { supabaseAdmin: sb } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')
  const { resolve8KContext, classifyItemsMateriality, ITEM_LABELS } = await import(
    '../lib/sec-8k-parser'
  )
  const { loadActiveArchetypes } = await import('../lib/archetype-loader')

  // Fetch 20 most-recent SEC 8-K events
  const { data: events, error } = await sb
    .from('events')
    .select('id, headline, event_date, source_url, source_name, raw_content, classifier_reasoning, trigger_theme_id, mentioned_tickers')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .order('event_date', { ascending: false })
    .limit(20)
  if (error) throw new Error(`fetch events: ${error.message}`)
  if (!events || events.length === 0) {
    console.log('no SEC 8-K events')
    return
  }

  console.log(`Loaded ${events.length} SEC 8-K events`)

  const archetypes = await loadActiveArchetypes()
  const archetypesBlock = archetypes
    .map((a) => `- ${a.id}: ${a.name} — ${a.description ?? ''}`)
    .join('\n')

  const IRRELEVANT_ONLY_ITEMS = new Set(['5.07', '5.08', '9.01'])

  function buildUserPrompt(
    context: { company_name: string; ticker: string | null; cik: string; items: string[] },
    headline: string,
    eventDate: string
  ) {
    const itemDescriptions =
      context.items.map((it) => `- ${it} (${ITEM_LABELS[it] ?? 'Unknown'})`).join('\n') ||
      '(no items parsed)'
    return `Filing: ${headline}
Event date: ${eventDate}
Company: ${context.company_name}
Ticker: ${context.ticker ?? 'unknown'}
CIK: ${context.cik}
Items filed:
${itemDescriptions}

Available archetypes (current active):
${archetypesBlock}

Decide action + archetype_id. Return JSON only.`
  }

  const results: Array<{
    i: number
    headline: string
    haiku: string
    sonnetAction: string
    sonnetArch: string | null
    sonnetReason: string
    diff: string
  }> = []

  let totalInput = 0
  let totalOutput = 0

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const short = e.headline.slice(0, 80).replace(/\s+/g, ' ')
    const haiku = (e.classifier_reasoning ?? '').replace(/\s+/g, ' ').slice(0, 160)

    const ctx = await resolve8KContext(e as Parameters<typeof resolve8KContext>[0])
    if (!ctx) {
      console.log(`[${i + 1}] ${short} — parse failed`)
      results.push({
        i: i + 1,
        headline: short,
        haiku,
        sonnetAction: 'parse_failed',
        sonnetArch: null,
        sonnetReason: '(8-K parse failed)',
        diff: 'N/A',
      })
      continue
    }

    // Pre-filter (same as classifier)
    const nonBoiler = ctx.items.filter((it) => !IRRELEVANT_ONLY_ITEMS.has(it))
    if (ctx.items.length > 0 && nonBoiler.length === 0) {
      const r = {
        i: i + 1,
        headline: short,
        haiku,
        sonnetAction: 'irrelevant',
        sonnetArch: null,
        sonnetReason: `[pre-filter] routine items: ${ctx.items.join(',')}`,
        diff: 'same (pre-filter both skip)',
      }
      results.push(r)
      console.log(`[${i + 1}] ${short} — pre-filter skip`)
      continue
    }

    try {
      const resp = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildUserPrompt(
              { company_name: ctx.company_name, ticker: ctx.ticker, cik: ctx.cik, items: ctx.items },
              e.headline,
              e.event_date ?? 'unknown'
            ),
          },
        ],
      })

      totalInput += resp.usage?.input_tokens ?? 0
      totalOutput += resp.usage?.output_tokens ?? 0

      const block = resp.content[0]
      const text = block && block.type === 'text' ? block.text : ''
      const m = text.match(/\{[\s\S]*\}/)
      let parsed: {
        action?: string
        archetype_id?: string | null
        reasoning?: string
        reasoning_zh?: string
      } = {}
      if (m) {
        try {
          parsed = JSON.parse(m[0])
        } catch {
          /* ignore */
        }
      }

      const sonnetAction = parsed.action ?? 'parse_error'
      const sonnetArch = parsed.archetype_id ?? null
      const sonnetReason = (parsed.reasoning ?? '').slice(0, 140)

      // Quick diff heuristic
      const haikuAction =
        /\[8-K irrelevant/.test(haiku) || /pre-filter/.test(haiku)
          ? 'irrelevant'
          : /\[8-K .+ · (high|medium|low)\]/.test(haiku) &&
            (e.trigger_theme_id == null ? 'exploratory' : 'match_archetype')
      // haikuAction may be boolean false if no match; normalize:
      const haikuActionStr =
        typeof haikuAction === 'string'
          ? haikuAction
          : haikuAction === false
            ? 'unknown'
            : 'match_or_exploratory'

      let diff = ''
      if (haikuActionStr === sonnetAction) diff = 'same'
      else diff = `Haiku=${haikuActionStr} · Sonnet=${sonnetAction}${sonnetArch ? `(${sonnetArch})` : ''}`

      results.push({
        i: i + 1,
        headline: short,
        haiku,
        sonnetAction: `${sonnetAction}${sonnetArch ? ` → ${sonnetArch}` : ''}`,
        sonnetArch,
        sonnetReason,
        diff,
      })
      console.log(`[${i + 1}] ${short}\n     haiku: ${haiku.slice(0, 100)}\n     sonnet: ${sonnetAction}${sonnetArch ? `(${sonnetArch})` : ''} · ${sonnetReason.slice(0, 100)}\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[${i + 1}] sonnet error: ${msg}`)
      results.push({
        i: i + 1,
        headline: short,
        haiku,
        sonnetAction: 'error',
        sonnetArch: null,
        sonnetReason: msg.slice(0, 140),
        diff: 'error',
      })
    }
  }

  // Cost summary
  const cost = (totalInput / 1_000_000) * 3 + (totalOutput / 1_000_000) * 15
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`SUMMARY`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`input_tokens:  ${totalInput}`)
  console.log(`output_tokens: ${totalOutput}`)
  console.log(`sonnet_cost:   $${cost.toFixed(4)}`)

  console.log('\n\n=== A/B TABLE ===\n')
  console.log('| # | Headline | Haiku 判 | Sonnet 判 | 差异 |')
  console.log('|---|---|---|---|---|')
  for (const r of results) {
    const h = r.haiku.slice(0, 90).replace(/\|/g, '\\|')
    const sa = r.sonnetAction.replace(/\|/g, '\\|')
    const sr = r.sonnetReason.slice(0, 90).replace(/\|/g, '\\|')
    const hl = r.headline.replace(/\|/g, '\\|')
    console.log(`| ${r.i} | ${hl} | ${h} | ${sa} · ${sr} | ${r.diff} |`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
