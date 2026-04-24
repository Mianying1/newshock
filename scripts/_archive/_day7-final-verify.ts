import { config } from 'dotenv'
config({ path: '.env.local' })

/**
 * Day 7 final verification — post FMP + SEC full backfill.
 * Read-only. Emits:
 *   (1) FMP + SEC pending/classified/attached counts
 *   (2) Theme creation delta (Day 7 total)
 *   (3) Step 5 deep dive: 132 match vs 62 trigger split by archetype
 */

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  console.log('=== (1) SEC 8-K state ===')
  const { count: secTotal } = await supabaseAdmin
    .from('events').select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
  const { count: secClassified } = await supabaseAdmin
    .from('events').select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('classifier_reasoning', 'is', null)
  const { count: secAttached } = await supabaseAdmin
    .from('events').select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('trigger_theme_id', 'is', null)
  console.log(`  total=${secTotal} · classified=${secClassified} · attached=${secAttached} · pending=${(secTotal ?? 0) - (secClassified ?? 0)}`)

  console.log('\n=== (2) FMP Backfill state ===')
  const { count: fmpTotal } = await supabaseAdmin
    .from('events').select('id', { count: 'exact', head: true })
    .ilike('source_name', 'FMP Backfill%')
  const { count: fmpClassified } = await supabaseAdmin
    .from('events').select('id', { count: 'exact', head: true })
    .ilike('source_name', 'FMP Backfill%')
    .not('classifier_reasoning', 'is', null)
  const { count: fmpAttached } = await supabaseAdmin
    .from('events').select('id', { count: 'exact', head: true })
    .ilike('source_name', 'FMP Backfill%')
    .not('trigger_theme_id', 'is', null)
  console.log(`  total=${fmpTotal} · classified=${fmpClassified} · attached=${fmpAttached} · pending=${(fmpTotal ?? 0) - (fmpClassified ?? 0)}`)

  console.log('\n=== (3) Theme table state ===')
  const { count: totalThemes } = await supabaseAdmin
    .from('themes').select('id', { count: 'exact', head: true })
  const { count: activeThemes } = await supabaseAdmin
    .from('themes').select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  const { count: coolingThemes } = await supabaseAdmin
    .from('themes').select('id', { count: 'exact', head: true })
    .eq('status', 'cooling')
  console.log(`  total=${totalThemes} · active=${activeThemes} · cooling=${coolingThemes}`)

  console.log('\n=== (4) Step 5 · SEC match events attachment analysis ===')
  // Fetch all SEC events with [8-K match] reasoning (i.e. decision.action === 'match_archetype')
  // Match rows whose classifier_reasoning starts with "[8-K " AND does NOT start with "[8-K irrelevant" or "[8-K exploratory" or "[8-K error]"
  // Simpler: library tags are: "[8-K {items} · {materiality}]" for match, "[8-K exploratory · ...]", "[8-K irrelevant · ...]", "[8-K error]"
  const matchRows: Array<{ id: string; headline: string; classifier_reasoning: string | null; trigger_theme_id: string | null; level_of_impact: string | null }> = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data } = await supabaseAdmin
      .from('events')
      .select('id, headline, classifier_reasoning, trigger_theme_id, level_of_impact')
      .eq('source_name', 'SEC EDGAR 8-K Filings')
      .eq('level_of_impact', 'subtheme')
      .range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    matchRows.push(...data)
    if (data.length < pageSize) break
  }
  const matchOnly = matchRows.filter((r) => !(r.classifier_reasoning ?? '').startsWith('[8-K exploratory'))
  const exploratory = matchRows.filter((r) => (r.classifier_reasoning ?? '').startsWith('[8-K exploratory'))
  const matchWithTrigger = matchOnly.filter((r) => r.trigger_theme_id)
  const matchNoTrigger = matchOnly.filter((r) => !r.trigger_theme_id)
  console.log(`  SEC subtheme rows total:      ${matchRows.length}`)
  console.log(`    → match_archetype:          ${matchOnly.length}`)
  console.log(`       with trigger_theme_id:   ${matchWithTrigger.length}`)
  console.log(`       without trigger_theme_id: ${matchNoTrigger.length} (archetype has no active theme)`)
  console.log(`    → exploratory:              ${exploratory.length}`)

  // Show 10 match_archetype rows without trigger (root-cause sample)
  console.log('\n  Sample no-trigger events (first 10):')
  for (const r of matchNoTrigger.slice(0, 10)) {
    console.log(`    ${r.headline.slice(0, 70)}`)
    console.log(`      reason: ${(r.classifier_reasoning ?? '').slice(0, 100)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
