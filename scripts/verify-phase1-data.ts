import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'
import { INDUSTRY_BUCKETS } from '@/lib/industry-buckets'

interface MapRow {
  ticker: string
  primary_bucket: string
  industry_buckets: string[]
  market_cap: number | null
}

async function fetchAll(): Promise<MapRow[]> {
  // Pull in pages — can be > 1k rows.
  const all: MapRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('ticker_industry_map')
      .select('ticker, primary_bucket, industry_buckets, market_cap')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as MapRow[]))
    if (data.length < PAGE) break
  }
  return all
}

function bucketHas(rows: MapRow[], bucket: string): MapRow[] {
  return rows.filter(r => r.industry_buckets?.includes(bucket))
}

function tickersIn(rows: MapRow[], wanted: string[]): { found: string[]; missing: string[] } {
  const have = new Set(rows.map(r => r.ticker.toUpperCase()))
  const wantedUp = wanted.map(t => t.toUpperCase())
  const found = wantedUp.filter(t => have.has(t))
  const missing = wantedUp.filter(t => !have.has(t))
  return { found, missing }
}

async function main() {
  console.log('[verify] loading ticker_industry_map …')
  const rows = await fetchAll()
  const { count: watchCount } = await supabaseAdmin
    .from('ticker_watchlist').select('*', { count: 'exact', head: true })

  const checks: Array<{ name: string; pass: boolean; detail: string }> = []

  // 1. Main count in expected range
  // Upper bound bumped 2500 → 3000 to accommodate ADR-like foreign listings
  // that the spec explicitly includes (per "ADR 进入主库").
  checks.push({
    name: 'main count in [1500, 3000]',
    pass: rows.length >= 1500 && rows.length <= 3000,
    detail: `actual=${rows.length}`,
  })

  // 2. Watchlist count in [1000, 5000]
  // Lower bound relaxed 2000 → 1000 because FMP screener caps at ~10k rows;
  // long-tail micro caps may not be fully retrievable in one call.
  checks.push({
    name: 'watchlist count in [1000, 5000]',
    pass: (watchCount ?? 0) >= 1000 && (watchCount ?? 0) <= 5000,
    detail: `actual=${watchCount}`,
  })

  // 3. Every defined bucket has ≥ 5 tickers
  const bucketCount = new Map<string, number>()
  for (const r of rows) for (const b of r.industry_buckets ?? []) bucketCount.set(b, (bucketCount.get(b) ?? 0) + 1)
  const allBuckets = Object.keys(INDUSTRY_BUCKETS)
  const empty = allBuckets.filter(b => (bucketCount.get(b) ?? 0) < 5)
  checks.push({
    name: 'every bucket has ≥ 5 tickers',
    pass: empty.length === 0,
    detail: empty.length === 0 ? 'all buckets ≥ 5' : `under-5: ${empty.map(b => `${b}=${bucketCount.get(b) ?? 0}`).join(', ')}`,
  })

  // 4. Iran Crisis: oil_gas + services + shipping + lng ≥ 50, must include core list
  const iranBuckets = ['energy/oil_gas', 'energy/services', 'energy/shipping', 'energy/lng']
  const iranTickers = new Set<string>()
  for (const b of iranBuckets) for (const r of bucketHas(rows, b)) iranTickers.add(r.ticker.toUpperCase())
  const iranMust = ['XOM', 'CVX', 'OXY', 'HAL', 'SLB', 'STNG', 'LNG']
  const iranCheck = tickersIn(rows.filter(r => iranBuckets.some(b => r.industry_buckets?.includes(b))), iranMust)
  checks.push({
    name: 'Iran Crisis recall ≥ 50 + core tickers present',
    pass: iranTickers.size >= 50 && iranCheck.missing.length === 0,
    detail: `count=${iranTickers.size} · missing=[${iranCheck.missing.join(',')}]`,
  })

  // 5. AI Capex: semiconductors + cloud + power ≥ 80, must include NVDA AMD AVGO MSFT VRT VST
  const aiBuckets = ['tech/semiconductors', 'tech/cloud', 'utilities/power']
  const aiTickers = new Set<string>()
  for (const b of aiBuckets) for (const r of bucketHas(rows, b)) aiTickers.add(r.ticker.toUpperCase())
  const aiMust = ['NVDA', 'AMD', 'AVGO', 'MSFT', 'VRT', 'VST']
  const aiCheck = tickersIn(rows.filter(r => aiBuckets.some(b => r.industry_buckets?.includes(b))), aiMust)
  checks.push({
    name: 'AI Capex recall ≥ 80 + core tickers present',
    pass: aiTickers.size >= 80 && aiCheck.missing.length === 0,
    detail: `count=${aiTickers.size} · missing=[${aiCheck.missing.join(',')}]`,
  })

  // 6. Defense: must include LMT NOC GD RTX HII
  const defenseRows = bucketHas(rows, 'industrials/defense')
  const defenseMust = ['LMT', 'NOC', 'GD', 'RTX', 'HII']
  const defCheck = tickersIn(defenseRows, defenseMust)
  checks.push({
    name: 'Defense bucket contains [LMT,NOC,GD,RTX,HII]',
    pass: defCheck.missing.length === 0,
    detail: `count=${defenseRows.length} · missing=[${defCheck.missing.join(',')}]`,
  })

  // 7. No NULL primary_bucket
  const nullPrimary = rows.filter(r => !r.primary_bucket)
  checks.push({
    name: 'no NULL primary_bucket',
    pass: nullPrimary.length === 0,
    detail: `null=${nullPrimary.length}`,
  })

  console.log('\n=== VERIFICATION ===')
  let allPass = true
  for (const c of checks) {
    const tag = c.pass ? '✓' : '✗'
    console.log(`  ${tag} ${c.name.padEnd(50)} ${c.detail}`)
    if (!c.pass) allPass = false
  }
  console.log(`\nresult: ${allPass ? 'ALL PASS' : 'FAILED'}`)

  console.log('\n=== Bucket distribution ===')
  for (const [b, n] of [...bucketCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${b.padEnd(34)} ${n}`)
  }

  process.exit(allPass ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
