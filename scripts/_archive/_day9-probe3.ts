import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  const { data: archs } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_tickers, deprecated')
  function flatten(tt: unknown): string[] {
    if (!tt) return []
    if (Array.isArray(tt)) return tt.filter((x): x is string => typeof x === 'string')
    if (typeof tt === 'object') {
      const out: string[] = []
      for (const [k, v] of Object.entries(tt as Record<string, unknown>)) {
        if (k === 'dynamic') continue
        if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === 'string'))
      }
      return out
    }
    return []
  }

  const { data: darkEvents } = await supabaseAdmin
    .from('events')
    .select('id, mentioned_tickers, classifier_reasoning, headline, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .eq('level_of_impact', 'subtheme')
    .is('trigger_theme_id', null)

  const darkMatchEvents = (darkEvents ?? []).filter((e) => {
    return e.classifier_reasoning && !e.classifier_reasoning.startsWith('[8-K exploratory')
  })

  // for unmatched: tally tickers + words from reasoning
  const unmatchedTickers: Record<string, number> = {}
  const reasoningSnippets: Array<{ id: string; tickers: string[]; reasoning: string }> = []
  for (const ev of darkMatchEvents) {
    const evTickers: string[] = ev.mentioned_tickers ?? []
    let bestOverlap = 0
    for (const a of archs ?? []) {
      if (a.deprecated) continue
      const at = flatten(a.typical_tickers)
      const overlap = evTickers.filter((t) => at.includes(t)).length
      if (overlap > bestOverlap) bestOverlap = overlap
    }
    if (bestOverlap === 0) {
      for (const t of evTickers) unmatchedTickers[t] = (unmatchedTickers[t] ?? 0) + 1
      reasoningSnippets.push({ id: ev.id, tickers: evTickers, reasoning: ev.classifier_reasoning ?? '' })
    }
  }

  const top = Object.entries(unmatchedTickers).sort((a, b) => b[1] - a[1])
  console.log(`\n=== unmatched dark event ticker tally (top 30) ===`)
  for (const [t, n] of top.slice(0, 30)) console.log(`  ${t}: ${n}`)

  // cluster reasoning by keyword to suggest archetype themes
  const keywords: Record<string, number> = {
    utility: 0, power: 0, grid: 0, water: 0, space: 0, satellite: 0, datacenter: 0,
    'silicon carbide': 0, 'rare earth': 0, defense: 0, nuclear: 0, pipeline: 0, LNG: 0, capex: 0, infrastructure: 0,
  }
  for (const s of reasoningSnippets) {
    const text = s.reasoning.toLowerCase()
    for (const k of Object.keys(keywords)) {
      if (text.includes(k)) keywords[k]++
    }
  }
  console.log(`\n=== reasoning keyword frequency in ${reasoningSnippets.length} unmatched events ===`)
  for (const [k, n] of Object.entries(keywords).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n}`)
  }

  console.log(`\n=== sample unmatched reasoning snippets ===`)
  for (const s of reasoningSnippets.slice(0, 15)) {
    console.log(`\n[${s.tickers.join(',')}] ${s.reasoning.slice(0, 200)}`)
  }
}

main().catch(console.error)
