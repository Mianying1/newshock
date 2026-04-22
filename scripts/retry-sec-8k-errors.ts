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

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { resolve8KContext } = await import('../lib/sec-8k-parser')
  const { classify8KEvent, applyDecision, buildArchetypeBlock } = await import('../lib/sec-8k-classifier')
  const { loadActiveArchetypes } = await import('../lib/archetype-loader')

  const archetypes = await loadActiveArchetypes()
  const archetypesBlock = buildArchetypeBlock(archetypes)

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_url, event_date, mentioned_tickers, trigger_theme_id, classifier_reasoning')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .or('classifier_reasoning.ilike.%error%,classifier_reasoning.ilike.%parse failed%,classifier_reasoning.ilike.%parse_failed%')

  const rows = (events ?? []) as EventRow[]
  console.log(`Retrying ${rows.length} events...\n`)

  for (const event of rows) {
    const context = await resolve8KContext(event)
    if (!context) {
      console.log(`  ✗ still parse_failed: ${event.headline.slice(0, 70)}`)
      continue
    }
    const decision = await classify8KEvent(event, context, archetypesBlock)
    await applyDecision(decision)
    const t = decision.ticker ?? '—'
    console.log(`  ${t.padEnd(6)} [${decision.items.join(',').padEnd(12)}] ${decision.action.padEnd(18)} ${decision.archetype_id ?? ''}`)
    await new Promise((r) => setTimeout(r, 150))
  }

  const { data: post } = await supabaseAdmin
    .from('events')
    .select('classifier_reasoning, mentioned_tickers, trigger_theme_id')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
  const postRows = post ?? []
  const hasTicker = postRows.filter((r) => r.mentioned_tickers?.length).length
  const hasTheme = postRows.filter((r) => r.trigger_theme_id).length
  const stillError = postRows.filter((r) => (r.classifier_reasoning ?? '').toLowerCase().includes('error') || (r.classifier_reasoning ?? '').toLowerCase().includes('parse failed')).length
  console.log(`\nFinal: ${postRows.length} total, tickers=${hasTicker}, theme=${hasTheme}, still_errors=${stillError}`)
}

main().catch(console.error)
