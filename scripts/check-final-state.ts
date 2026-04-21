import { config } from 'dotenv'
config({ path: '.env.localc' })

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: themeStatus } = await supabase.from('themes').select('status')
  const statusCounts: Record<string, number> = {}
  for (const r of themeStatus ?? []) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1
  console.log('=== themes by status ===')
  console.log(JSON.stringify(statusCounts, null, 2))

  const { data: tickerSectors } = await supabase.from('tickers').select('sector')
  const sectorCounts: Record<string, number> = {}
  for (const r of tickerSectors ?? []) sectorCounts[r.sector ?? 'null'] = (sectorCounts[r.sector ?? 'null'] ?? 0) + 1
  const sorted = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])
  console.log('\n=== tickers by sector ===')
  console.log(JSON.stringify(Object.fromEntries(sorted), null, 2))

  const { count } = await supabase.from('ticker_candidates').select('*', { count: 'exact', head: true })
  console.log(`\n=== ticker_candidates count ===\n${count}`)
}

main().catch(e => { console.error(e); process.exit(1) })
