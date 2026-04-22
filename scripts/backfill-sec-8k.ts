import { config } from 'dotenv'
config({ path: '.env.local' })

interface EventRow {
  id: string
  headline: string
  source_url: string | null
  event_date: string | null
  mentioned_tickers: string[] | null
  trigger_theme_id: string | null
  classifier_reasoning: string | null
}

const CONCURRENCY = 3
const SEC_RATE_DELAY_MS = 120

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { resolve8KContext } = await import('../lib/sec-8k-parser')
  const { classify8KEvent, applyDecision, buildArchetypeBlock } = await import('../lib/sec-8k-classifier')
  const { loadActiveArchetypes } = await import('../lib/archetype-loader')

  const archetypes = await loadActiveArchetypes()
  const archetypesBlock = buildArchetypeBlock(archetypes)
  console.log(`Loaded ${archetypes.length} active archetypes for matching.`)

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_url, event_date, mentioned_tickers, trigger_theme_id, classifier_reasoning')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .order('event_date', { ascending: false })

  if (error || !events) {
    console.error('Failed to fetch events:', error?.message)
    process.exit(1)
  }

  const rows = events as EventRow[]
  console.log(`\nTotal 8-K events: ${rows.length}`)
  console.log(`Before: ${rows.filter((e) => e.trigger_theme_id).length} matched theme, ${rows.filter((e) => e.mentioned_tickers?.length).length} with ticker\n`)

  const before = {
    with_ticker: rows.filter((e) => e.mentioned_tickers && e.mentioned_tickers.length > 0).length,
    with_theme: rows.filter((e) => e.trigger_theme_id).length,
  }

  const decisions: Array<{
    id: string
    headline: string
    action: string
    ticker: string | null
    items: string[]
    materiality: string
    archetype_id: string | null
    reasoning: string
  }> = []
  const itemDist: Record<string, number> = {}

  const queue = [...rows]
  async function worker(wid: number) {
    while (queue.length > 0) {
      const event = queue.shift()
      if (!event) return
      try {
        const context = await resolve8KContext(event)
        if (!context) {
          console.log(`[w${wid}] ${event.id} parse failed: ${event.headline.slice(0, 60)}`)
          decisions.push({ id: event.id, headline: event.headline, action: 'parse_failed', ticker: null, items: [], materiality: 'low', archetype_id: null, reasoning: 'headline parse failed' })
          await supabaseAdmin.from('events').update({ classifier_reasoning: '[8-K parse failed]' }).eq('id', event.id)
          continue
        }

        for (const it of context.items) itemDist[it] = (itemDist[it] ?? 0) + 1

        const decision = await classify8KEvent(event, context, archetypesBlock)
        await applyDecision(decision)
        decisions.push({
          id: event.id,
          headline: event.headline,
          action: decision.action,
          ticker: decision.ticker,
          items: decision.items,
          materiality: decision.materiality,
          archetype_id: decision.archetype_id,
          reasoning: decision.reasoning,
        })
        const tickerStr = decision.ticker ?? '—'
        console.log(`[w${wid}] ${tickerStr.padEnd(6)} [${decision.items.join(',').padEnd(12)}] ${decision.action.padEnd(18)} ${decision.archetype_id ?? ''}`)
      } catch (e) {
        console.error(`[w${wid}] ${event.id} error:`, (e as Error).message)
      }
      await new Promise((r) => setTimeout(r, SEC_RATE_DELAY_MS))
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)))

  const after = {
    match_archetype: decisions.filter((d) => d.action === 'match_archetype').length,
    exploratory: decisions.filter((d) => d.action === 'exploratory').length,
    irrelevant: decisions.filter((d) => d.action === 'irrelevant').length,
    error: decisions.filter((d) => d.action === 'error').length,
    parse_failed: decisions.filter((d) => d.action === 'parse_failed').length,
    with_ticker: decisions.filter((d) => d.ticker).length,
  }

  const archetypeHits: Record<string, number> = {}
  for (const d of decisions) {
    if (d.archetype_id) archetypeHits[d.archetype_id] = (archetypeHits[d.archetype_id] ?? 0) + 1
  }

  console.log(`\n=== Results ===`)
  console.log(`Before: ticker=${before.with_ticker} theme=${before.with_theme}`)
  console.log(`After:`)
  console.log(`  tickers populated: ${after.with_ticker} (+${after.with_ticker - before.with_ticker})`)
  console.log(`  match_archetype: ${after.match_archetype}`)
  console.log(`  exploratory:     ${after.exploratory}`)
  console.log(`  irrelevant:      ${after.irrelevant}`)
  console.log(`  error:           ${after.error}`)
  console.log(`  parse_failed:    ${after.parse_failed}`)

  console.log(`\nItem type distribution:`)
  const sortedItems = Object.entries(itemDist).sort((a, b) => b[1] - a[1])
  for (const [it, n] of sortedItems) console.log(`  ${it}: ${n}`)

  if (Object.keys(archetypeHits).length > 0) {
    console.log(`\nArchetype matches:`)
    for (const [a, n] of Object.entries(archetypeHits).sort((x, y) => y[1] - x[1])) {
      console.log(`  ${a}: ${n}`)
    }
  }

  const fs = await import('fs')
  fs.writeFileSync(
    'data/sec-8k-backfill-results.json',
    JSON.stringify({ before, after, itemDist, archetypeHits, decisions }, null, 2)
  )
  console.log(`\nSaved to data/sec-8k-backfill-results.json`)
}

main().catch(console.error)
