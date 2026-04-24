import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // Look at SEC events whose classifier_reasoning starts with [8-K error]
  // or [8-K parse failed], recent.
  const { data: errorRows } = await supabaseAdmin
    .from('events')
    .select('id, headline, classifier_reasoning')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .or('classifier_reasoning.ilike.%[8-K error]%,classifier_reasoning.ilike.%[8-K parse failed]%,classifier_reasoning.ilike.%[error]%')
    .limit(20)
  console.log(`recent SEC events with error/parse_failed reasoning:`)
  for (const r of errorRows ?? []) {
    console.log(`  ${r.headline.slice(0, 70)}`)
    console.log(`    reason: ${(r.classifier_reasoning ?? '').slice(0, 180)}`)
  }

  // Top themes newly associated to SEC events (just-classified)
  const { data: assoc } = await supabaseAdmin
    .from('events')
    .select('trigger_theme_id, headline')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('trigger_theme_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)
  const themeCounts: Record<string, number> = {}
  for (const r of assoc ?? []) {
    const tid = r.trigger_theme_id as string
    themeCounts[tid] = (themeCounts[tid] ?? 0) + 1
  }
  const topThemeIds = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  console.log(`\ntop themes by recent SEC events attached:`)
  for (const [tid, n] of topThemeIds) {
    const { data: theme } = await supabaseAdmin
      .from('themes')
      .select('name, slug, event_count, first_event_at')
      .eq('id', tid)
      .maybeSingle()
    console.log(`  ${tid.slice(0, 8)} · +${n} · name="${theme?.name ?? '?'}" · event_count=${theme?.event_count ?? '?'}`)
  }

  // How many SEC events got classified in this run (last ~10 min)
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count: justClassified } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('classifier_reasoning', 'is', null)
    .gte('created_at', tenMinAgo)
  console.log(`\nSEC events classified in last 10 min: ${justClassified}`)

  const { count: justMatched } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('trigger_theme_id', 'is', null)
    .gte('created_at', tenMinAgo)
  console.log(`  of which attached to theme: ${justMatched}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
