import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync, writeFileSync } from 'node:fs'

const SEC_UA = 'Newshock industry probe sukiblackground@gmail.com'
const SEC_RATE_MS = 110  // ~9 req/s, under SEC's 10 req/s cap

interface FmpRow {
  symbol: string
  companyName: string
  marketCap: number
  industry: string | null
  sector: string | null
  exchangeShortName: string | null
  country: string | null
}

interface FmpFile {
  main_tier: FmpRow[]
  watchlist: FmpRow[]
}

interface SecCompanyTickersEntry {
  cik_str: number
  ticker: string
  title: string
}

interface SecSubmissionsResponse {
  cik?: string
  sic?: string
  sicDescription?: string
  name?: string
}

interface EnrichedRow extends FmpRow {
  tier: 'main' | 'watchlist'
  cik: string | null
  sec_sic: number | null
  sec_sic_description: string | null
  sec_name: string | null
  sec_status: 'ok' | 'no_cik' | 'http_error' | 'empty' | 'parse_error'
  is_adr: boolean
}

async function fetchTickerCikMap(): Promise<Map<string, string>> {
  console.log('[sec] fetching company_tickers.json …')
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_UA, 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`SEC company_tickers.json: HTTP ${res.status}`)
  const data = (await res.json()) as Record<string, SecCompanyTickersEntry>
  const m = new Map<string, string>()
  for (const v of Object.values(data)) {
    m.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, '0'))
  }
  console.log(`[sec] ${m.size} ticker→CIK mappings`)
  return m
}

async function fetchSecSubmissions(cik: string): Promise<SecSubmissionsResponse | null> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`
  const res = await fetch(url, { headers: { 'User-Agent': SEC_UA, 'Accept': 'application/json' } })
  if (!res.ok) return null
  return (await res.json()) as SecSubmissionsResponse
}

function symbolVariants(symbol: string): string[] {
  // BRK.B → BRK.B, BRK-B, BRK
  const out = new Set<string>([symbol.toUpperCase()])
  out.add(symbol.replace(/\./g, '-').toUpperCase())
  out.add(symbol.replace(/[.\-].*$/, '').toUpperCase())
  return Array.from(out)
}

function looksLikeAdr(secName: string | null): boolean {
  if (!secName) return false
  const n = secName.toUpperCase()
  return /\bPLC\b|\bLTD\b|\bLIMITED\b|\/UK|\/CAYMAN|\/CHILE|\/IRELAND|\/SWITZ|\/NETHERLANDS|\/JAPAN|\/SOUTH AFRICA|\/SWEDEN/.test(n)
}

async function enrich(rows: FmpRow[], tier: 'main' | 'watchlist', tickerCik: Map<string, string>): Promise<EnrichedRow[]> {
  const out: EnrichedRow[] = []
  let i = 0
  const t0 = Date.now()
  for (const r of rows) {
    i++
    let cik: string | null = null
    for (const v of symbolVariants(r.symbol)) {
      if (tickerCik.has(v)) { cik = tickerCik.get(v)!; break }
    }
    if (!cik) {
      out.push({ ...r, tier, cik: null, sec_sic: null, sec_sic_description: null, sec_name: null, sec_status: 'no_cik', is_adr: false })
      continue
    }
    let sub: SecSubmissionsResponse | null = null
    try {
      sub = await fetchSecSubmissions(cik)
    } catch (e) {
      out.push({ ...r, tier, cik, sec_sic: null, sec_sic_description: null, sec_name: null, sec_status: 'parse_error', is_adr: false })
      await new Promise(res => setTimeout(res, SEC_RATE_MS))
      continue
    }
    if (!sub) {
      out.push({ ...r, tier, cik, sec_sic: null, sec_sic_description: null, sec_name: null, sec_status: 'http_error', is_adr: false })
    } else {
      const sicNum = sub.sic ? parseInt(sub.sic, 10) : null
      out.push({
        ...r,
        tier,
        cik,
        sec_sic: Number.isFinite(sicNum) ? sicNum : null,
        sec_sic_description: sub.sicDescription ?? null,
        sec_name: sub.name ?? null,
        sec_status: 'ok',
        is_adr: looksLikeAdr(sub.name ?? null),
      })
    }
    if (i % 100 === 0) {
      const elapsed = (Date.now() - t0) / 1000
      const rate = i / elapsed
      const eta = (rows.length - i) / rate
      console.log(`  [${tier}] ${i}/${rows.length} (${rate.toFixed(1)} req/s · eta ${eta.toFixed(0)}s)`)
    }
    await new Promise(res => setTimeout(res, SEC_RATE_MS))
  }
  return out
}

async function main() {
  const fmp = JSON.parse(readFileSync('/tmp/fmp-tickers.json', 'utf-8')) as FmpFile
  console.log(`[in] main: ${fmp.main_tier.length} · watchlist: ${fmp.watchlist.length}`)

  const tickerCik = await fetchTickerCikMap()

  const enrichedMain = await enrich(fmp.main_tier, 'main', tickerCik)
  // Watchlist: skip SEC enrichment to save time per spec ("可选 · 看时间")
  // Save FMP rows directly with sec_status='no_cik' fallback.
  const enrichedWatch: EnrichedRow[] = fmp.watchlist.map(r => ({
    ...r,
    tier: 'watchlist',
    cik: tickerCik.get(r.symbol.toUpperCase()) ?? null,
    sec_sic: null,
    sec_sic_description: null,
    sec_name: null,
    sec_status: 'no_cik',
    is_adr: false,
  }))

  const stats = {
    main_total: enrichedMain.length,
    main_sec_ok: enrichedMain.filter(r => r.sec_status === 'ok').length,
    main_sec_no_cik: enrichedMain.filter(r => r.sec_status === 'no_cik').length,
    main_sec_http_error: enrichedMain.filter(r => r.sec_status === 'http_error').length,
    main_sec_parse_error: enrichedMain.filter(r => r.sec_status === 'parse_error').length,
    main_adr: enrichedMain.filter(r => r.is_adr).length,
    watchlist_total: enrichedWatch.length,
  }

  writeFileSync('/tmp/sec-enriched.json', JSON.stringify({
    generated_at: new Date().toISOString(),
    stats,
    main: enrichedMain,
    watchlist: enrichedWatch,
  }, null, 2))

  console.log('\n=== SEC enrichment stats ===')
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(28)} ${v}`)
  console.log('written: /tmp/sec-enriched.json')
}

main().catch(e => { console.error(e); process.exit(1) })
