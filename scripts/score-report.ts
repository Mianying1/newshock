import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  // Top 10 scores
  const { data: top10 } = await supabaseAdmin
    .from('event_scores')
    .select('ticker_symbol, score, tier, score_breakdown, event_id')
    .order('score', { ascending: false })
    .limit(10)

  // Fetch headlines for those events
  const eventIds = Array.from(new Set((top10 ?? []).map(r => r.event_id)))
  const { data: eventsData } = await supabaseAdmin
    .from('events')
    .select('id, headline, pattern_id')
    .in('id', eventIds)

  const eventMap = Object.fromEntries((eventsData ?? []).map(e => [e.id, e]))

  console.log('## Top 10 Scores\n')
  console.log('| ticker | score | tier | pattern | headline |')
  console.log('|---|---|---|---|---|')
  for (const r of top10 ?? []) {
    const ev = eventMap[r.event_id]
    const headline = (ev?.headline ?? '').slice(0, 60)
    console.log(`| ${r.ticker_symbol} | ${r.score} | ${r.tier} | ${ev?.pattern_id ?? ''} | ${headline}... |`)
  }

  // Full breakdown for the highest-scoring row
  const top = top10?.[0]
  if (top) {
    console.log('\n## Full score_breakdown for top result\n')
    console.log('Event:', eventMap[top.event_id]?.headline)
    console.log('Ticker:', top.ticker_symbol, '| Tier:', top.tier)
    console.log(JSON.stringify(top.score_breakdown, null, 2))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
