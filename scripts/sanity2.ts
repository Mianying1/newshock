import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  const { data: all, count } = await supabaseAdmin
    .from('events')
    .select('headline, source_name', { count: 'exact' })
    .order('created_at', { ascending: false })

  // 1. Source distribution
  const dist: Record<string, number> = {}
  for (const r of all ?? []) dist[r.source_name] = (dist[r.source_name] ?? 0) + 1
  console.log('## 1. Source distribution')
  console.log('| source_name | count |')
  console.log('|---|---|')
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1]))
    console.log(`| ${k} | ${v} |`)
  console.log(`\nTotal rows: ${count}`)

  // 2. Top 3 Google News headlines
  const gn = (all ?? []).filter(r => r.source_name === 'Google News: AI/Semi Keywords').slice(0, 3)
  console.log('\n## 2. Google News top 3 headlines')
  gn.forEach((r, i) => console.log(`${i+1}. ${r.headline}`))

  // 3. Top 3 FT headlines
  const ft = (all ?? []).filter(r => r.source_name === 'Financial Times').slice(0, 3)
  console.log('\n## 3. Financial Times top 3 headlines')
  ft.forEach((r, i) => console.log(`${i+1}. ${r.headline}`))
}

main().catch(e => { console.error(e); process.exit(1) })
