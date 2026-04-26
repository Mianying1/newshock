import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBuckets, pickPrimaryBucket } from '@/lib/sic-to-bucket'
import { INDUSTRY_BUCKETS, type IndustryBucket } from '@/lib/industry-buckets'

interface EnrichedRow {
  symbol: string
  companyName: string
  marketCap: number
  industry: string | null
  sector: string | null
  exchangeShortName: string | null
  country: string | null
  tier: 'main' | 'watchlist'
  cik: string | null
  sec_sic: number | null
  sec_sic_description: string | null
  sec_name: string | null
  sec_status: string
  is_adr: boolean
}

interface EnrichedFile {
  main: EnrichedRow[]
  watchlist: EnrichedRow[]
}

const BATCH = 500

async function upsertMain(rows: Array<Record<string, unknown>>) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const { error } = await supabaseAdmin
      .from('ticker_industry_map')
      .upsert(slice, { onConflict: 'ticker' })
    if (error) throw new Error(`main upsert @${i}: ${error.message}`)
    console.log(`  main upsert ${i + slice.length}/${rows.length}`)
  }
}

async function upsertWatch(rows: Array<Record<string, unknown>>) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const { error } = await supabaseAdmin
      .from('ticker_watchlist')
      .upsert(slice, { onConflict: 'ticker' })
    if (error) throw new Error(`watch upsert @${i}: ${error.message}`)
    console.log(`  watch upsert ${i + slice.length}/${rows.length}`)
  }
}

async function main() {
  const data = JSON.parse(readFileSync('/tmp/sec-enriched.json', 'utf-8')) as { main: EnrichedRow[]; watchlist: EnrichedRow[] }

  const mainRows: Array<Record<string, unknown>> = []
  const skippedNoBucket: Array<{ ticker: string; sic: number | null; fmp_industry: string | null }> = []
  const bucketCount = new Map<IndustryBucket, number>()
  let multiBucketCount = 0

  for (const r of data.main) {
    const buckets = resolveBuckets(r.sec_sic, r.industry)
    const primary = pickPrimaryBucket(r.sec_sic, r.industry)
    if (buckets.length === 0 || !primary) {
      skippedNoBucket.push({ ticker: r.symbol, sic: r.sec_sic, fmp_industry: r.industry })
      continue
    }
    if (buckets.length > 1) multiBucketCount++
    for (const b of buckets) bucketCount.set(b, (bucketCount.get(b) ?? 0) + 1)

    mainRows.push({
      ticker: r.symbol,
      cik: r.cik,
      company_name: r.companyName,
      sec_sic: r.sec_sic,
      sec_sic_description: r.sec_sic_description,
      fmp_industry: r.industry,
      fmp_sector: r.sector,
      fmp_sub_industry: null,
      industry_buckets: buckets,
      primary_bucket: primary,
      manual_override_reason: null,
      market_cap: r.marketCap,
      exchange: r.exchangeShortName,
      is_adr: r.is_adr,
      source: 'auto_sec_fmp',
    })
  }

  const watchRows = data.watchlist.map(r => ({
    ticker: r.symbol,
    cik: r.cik,
    company_name: r.companyName,
    sec_sic: r.sec_sic,
    sec_sic_description: r.sec_sic_description,
    fmp_industry: r.industry,
    fmp_sector: r.sector,
    market_cap: r.marketCap,
    exchange: r.exchangeShortName,
  }))

  console.log(`[plan] main rows to insert: ${mainRows.length}`)
  console.log(`[plan] main skipped (no bucket): ${skippedNoBucket.length}`)
  console.log(`[plan] watchlist rows: ${watchRows.length}`)

  await upsertMain(mainRows)
  await upsertWatch(watchRows)

  console.log('\n=== Bucket distribution (main) ===')
  const allBuckets = Object.keys(INDUSTRY_BUCKETS) as IndustryBucket[]
  const sortedBuckets = [...allBuckets].sort((a, b) => (bucketCount.get(b) ?? 0) - (bucketCount.get(a) ?? 0))
  for (const b of sortedBuckets) {
    const n = bucketCount.get(b) ?? 0
    const bar = '█'.repeat(Math.min(40, Math.ceil(n / 5)))
    console.log(`  ${b.padEnd(34)} ${String(n).padStart(5)} ${bar}`)
  }
  console.log(`\nmulti-bucket tickers: ${multiBucketCount}`)

  if (skippedNoBucket.length > 0) {
    console.log(`\n=== Skipped (no bucket) — first 50 ===`)
    for (const s of skippedNoBucket.slice(0, 50)) {
      console.log(`  ${s.ticker.padEnd(8)} sic=${s.sic ?? '-'}  fmp="${s.fmp_industry ?? '-'}"`)
    }
    if (skippedNoBucket.length > 50) console.log(`  … +${skippedNoBucket.length - 50} more`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
