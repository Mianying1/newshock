import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'node:fs'

const FMP_KEY = process.env.FMP_API_KEY
if (!FMP_KEY) { console.error('FMP_API_KEY missing'); process.exit(1) }

interface FmpScreenerRow {
  symbol: string
  companyName: string
  marketCap: number
  sector: string | null
  industry: string | null
  exchangeShortName: string | null
  exchange?: string | null
  country: string | null
  isActivelyTrading: boolean
  isFund?: boolean
  isEtf?: boolean
}

const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'AMEX'])
const MAIN_CUTOFF = 1_000_000_000      // $1B
const WATCH_CUTOFF = 100_000_000       // $100M
// Block China/HK domiciles only — keep all other countries for ADR-like
// listings (Monaco, UK, Cayman, etc. — STNG/ARM/TSM live here).
const BLOCKED_COUNTRIES = new Set(['CN', 'HK', 'CHN', 'HKG'])

async function fetchScreener(): Promise<FmpScreenerRow[]> {
  // Stable endpoint name: company-screener. v3 also exposes /api/v3/stock-screener.
  // Try stable first then v3 as fallback.
  const params = new URLSearchParams({
    marketCapMoreThan: String(WATCH_CUTOFF),
    isActivelyTrading: 'true',
    limit: '20000',
    apikey: FMP_KEY!,
  })
  const stableUrl = `https://financialmodelingprep.com/stable/company-screener?${params}`
  const v3Url = `https://financialmodelingprep.com/api/v3/stock-screener?${params}`

  for (const url of [stableUrl, v3Url]) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`  ${url.split('?')[0]}: HTTP ${res.status}`)
        continue
      }
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        console.log(`  ${url.split('?')[0]}: ${data.length} rows`)
        return data as FmpScreenerRow[]
      }
      console.warn(`  ${url.split('?')[0]}: empty response`)
    } catch (e) {
      console.warn(`  ${url.split('?')[0]}: ${String(e)}`)
    }
  }
  throw new Error('Both FMP screener endpoints failed')
}

function isLikelySpacOrShell(name: string, industry: string | null): boolean {
  const n = name.toLowerCase()
  if (/\b(acquisition|spac|blank check)\b/.test(n)) return true
  if (industry === 'Shell Companies') return true
  return false
}

async function main() {
  console.log('[fmp] fetching screener (marketCap >= $100M, US, active)…')
  const all = await fetchScreener()

  const filtered = all.filter(r => {
    if (!r.symbol || !r.companyName) return false
    if (!r.isActivelyTrading) return false
    if (r.isFund || r.isEtf) return false
    const ex = (r.exchangeShortName ?? r.exchange ?? '').toUpperCase()
    if (!ALLOWED_EXCHANGES.has(ex)) return false
    if (typeof r.marketCap !== 'number' || r.marketCap < WATCH_CUTOFF) return false
    if (isLikelySpacOrShell(r.companyName, r.industry)) return false
    // Block CN/HK only — keep other foreign domiciles since they're ADR-like
    // listings on US exchanges (per spec: ADR 进入主库 · 中概股不进).
    if (r.country && BLOCKED_COUNTRIES.has(r.country.toUpperCase())) return false
    return true
  })

  // Dedup by symbol (keep largest market cap)
  const bySymbol = new Map<string, FmpScreenerRow>()
  for (const r of filtered) {
    const ex = (r.exchangeShortName ?? r.exchange ?? '').toUpperCase()
    const norm = { ...r, exchangeShortName: ex }
    const prev = bySymbol.get(r.symbol)
    if (!prev || (r.marketCap ?? 0) > (prev.marketCap ?? 0)) bySymbol.set(r.symbol, norm)
  }
  const unique = Array.from(bySymbol.values())

  const main_tier = unique.filter(r => r.marketCap >= MAIN_CUTOFF)
  const watch_tier = unique.filter(r => r.marketCap >= WATCH_CUTOFF && r.marketCap < MAIN_CUTOFF)

  // Stats
  const exchanges = new Map<string, number>()
  for (const r of unique) {
    const k = r.exchangeShortName ?? '(none)'
    exchanges.set(k, (exchanges.get(k) ?? 0) + 1)
  }
  const sectors = new Map<string, number>()
  for (const r of main_tier) {
    const k = r.sector ?? '(none)'
    sectors.set(k, (sectors.get(k) ?? 0) + 1)
  }

  const out = {
    fetched_at: new Date().toISOString(),
    total_raw: all.length,
    after_filter: unique.length,
    main_tier_count: main_tier.length,
    watchlist_count: watch_tier.length,
    main_tier,
    watchlist: watch_tier,
  }

  writeFileSync('/tmp/fmp-tickers.json', JSON.stringify(out, null, 2))

  console.log('---')
  console.log(`raw rows:        ${all.length}`)
  console.log(`after filter:    ${unique.length}`)
  console.log(`main tier (>=$1B):    ${main_tier.length}`)
  console.log(`watchlist ($100M-$1B):${watch_tier.length}`)
  console.log('exchange breakdown:')
  for (const [k, v] of [...exchanges.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${v}`)
  }
  console.log('main-tier sector breakdown (top 10):')
  for (const [k, v] of [...sectors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${(k || '(none)').padEnd(28)} ${v}`)
  }
  console.log('written: /tmp/fmp-tickers.json')

  // Bounds checks (per task spec)
  if (main_tier.length < 1000) {
    console.warn('\n⚠ WARN: main tier < 1000 — filter may be too strict')
  }
  if (main_tier.length > 5000) {
    console.warn('\n⚠ WARN: main tier > 5000 — FMP filter may not have applied')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
