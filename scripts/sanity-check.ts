import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  const [q1, q2, q3] = await Promise.all([
    supabaseAdmin.from('events').select('source_name'),
    supabaseAdmin.from('events').select('headline'),
    supabaseAdmin.from('events').select('mentioned_tickers'),
  ])

  // 1. source_name distribution
  const dist: Record<string, number> = {}
  for (const r of q1.data ?? []) {
    dist[r.source_name] = (dist[r.source_name] ?? 0) + 1
  }
  console.log('## 1. Source distribution')
  console.log('| source_name | count |')
  console.log('|-------------|-------|')
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`| ${k} | ${v} |`)
  }

  // 2. Headlines starting with "8-K"
  const eightK = (q2.data ?? []).filter(r => r.headline.startsWith('8-K')).length
  console.log('\n## 2. Headlines starting with "8-K"')
  console.log('| metric | count |')
  console.log('|--------|-------|')
  console.log(`| 8-K headlines | ${eightK} |`)
  console.log(`| other headlines | ${(q2.data ?? []).length - eightK} |`)

  // 3. Non-empty mentioned_tickers
  const withTickers = (q3.data ?? []).filter(r => r.mentioned_tickers && r.mentioned_tickers.length > 0).length
  console.log('\n## 3. mentioned_tickers non-empty')
  console.log('| metric | count |')
  console.log('|--------|-------|')
  console.log(`| has tickers | ${withTickers} |`)
  console.log(`| no tickers | ${(q3.data ?? []).length - withTickers} |`)
}

main().catch(e => { console.error(e); process.exit(1) })
