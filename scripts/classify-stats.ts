import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  // Pattern distribution
  const { data: all } = await supabaseAdmin
    .from('events')
    .select('pattern_id, novel_tickers')

  const patternDist: Record<string, number> = {}
  const novelCount: Record<string, number> = {}

  for (const r of all ?? []) {
    const pid = r.pattern_id ?? 'null'
    patternDist[pid] = (patternDist[pid] ?? 0) + 1
    for (const t of r.novel_tickers ?? []) {
      novelCount[t] = (novelCount[t] ?? 0) + 1
    }
  }

  console.log('## Pattern distribution')
  console.log('| pattern_id | count |')
  console.log('|---|---|')
  for (const [k, v] of Object.entries(patternDist).sort((a, b) => b[1] - a[1]))
    console.log(`| ${k} | ${v} |`)

  console.log('\n## Top 5 novel_tickers (库外 ticker 候选)')
  console.log('| ticker | appearances |')
  console.log('|---|---|')
  const top5 = Object.entries(novelCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  for (const [t, n] of top5) console.log(`| ${t} | ${n} |`)
}

main().catch(e => { console.error(e); process.exit(1) })
