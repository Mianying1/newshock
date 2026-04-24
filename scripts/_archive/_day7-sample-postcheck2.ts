import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // SEC events total/classified/theme-attached
  const { count: total } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
  const { count: classified } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('classifier_reasoning', 'is', null)
  const { count: attached } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('trigger_theme_id', 'is', null)
  console.log(`SEC EDGAR 8-K Filings:`)
  console.log(`  total:                   ${total}`)
  console.log(`  classifier_reasoning:    ${classified} (pending=${(total ?? 0) - (classified ?? 0)})`)
  console.log(`  trigger_theme_id set:    ${attached}`)

  // Sample recently-classified (classifier_reasoning set) SEC events — show reasoning tags
  const { data: recent } = await supabaseAdmin
    .from('events')
    .select('id, headline, classifier_reasoning, trigger_theme_id')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .not('classifier_reasoning', 'is', null)
    .order('event_date', { ascending: false })
    .limit(120)

  // Bucket by first token of reasoning
  const buckets: Record<string, number> = {}
  for (const r of recent ?? []) {
    const tag = (r.classifier_reasoning as string).match(/^\[([^\]]+)\]/)?.[1] ?? 'other'
    buckets[tag] = (buckets[tag] ?? 0) + 1
  }
  console.log(`\nreasoning tag distribution (newest 120 by event_date):`)
  for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
    console.log(`  [${k}] : ${v}`)
  }

  // Top themes attached (among recent classified)
  const themeCounts: Record<string, number> = {}
  for (const r of recent ?? []) {
    if (r.trigger_theme_id) themeCounts[r.trigger_theme_id as string] = (themeCounts[r.trigger_theme_id as string] ?? 0) + 1
  }
  const topIds = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log(`\ntop themes among newest-dated classified SEC events (event_count per theme in sample):`)
  for (const [tid, n] of topIds) {
    const { data } = await supabaseAdmin
      .from('themes')
      .select('name, status, event_count, first_event_at')
      .eq('id', tid)
      .maybeSingle()
    console.log(`  ${tid.slice(0, 8)} · +${n} · ${data ? `name="${data.name}" · status=${data.status} · event_count=${data.event_count} · first=${(data.first_event_at ?? '').slice(0, 10)}` : 'THEME ID NOT FOUND'}`)
  }

  // Error reasonings (likely transient API failures, should be re-runnable)
  const { count: errCount } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .ilike('classifier_reasoning', '%[8-K error]%')
  console.log(`\nSEC events with [8-K error] reasoning (can be retried): ${errCount}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
