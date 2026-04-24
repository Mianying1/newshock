import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync } from 'fs'

const UA = 'Newshock Research research@newshock.app'

interface Entry {
  form: string
  company: string
  cik: string
  date: string
  path: string
}

const ROW_RE = /^(\S+(?:\s+\S+)*?)\s{2,}(.+?)\s{2,}(\d+)\s{2,}(\d{4}-\d{2}-\d{2})\s+(\S+)\s*$/

function parseFormIdx(text: string): Entry[] {
  const lines = text.split('\n')
  const out: Entry[] = []
  let started = false
  for (const line of lines) {
    if (/^-{10,}/.test(line)) { started = true; continue }
    if (!started) continue
    if (line.trim().length === 0) continue
    const m = line.match(ROW_RE)
    if (!m) continue
    out.push({ form: m[1].trim(), company: m[2].trim(), cik: m[3].trim(), date: m[4], path: m[5] })
  }
  return out
}

async function fetchIdx(url: string): Promise<Entry[]> {
  console.log(`[fetch] ${url}`)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  const text = await res.text()
  return parseFormIdx(text)
}

async function fetchCikMap(): Promise<Map<string, string>> {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} from company_tickers.json`)
  const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>
  const map = new Map<string, string>()
  for (const v of Object.values(data)) {
    map.set(String(v.cik_str), v.ticker.toUpperCase())
  }
  return map
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // 1. Collect target_tickers
  const sp500 = new Set(
    readFileSync('data/sp500-tickers.txt', 'utf8')
      .split('\n').map((l) => l.trim()).filter(Boolean)
  )
  console.log(`S&P 500 tickers: ${sp500.size}`)

  const { data: recs, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol')
  if (error || !recs) throw new Error(`rec fetch: ${error?.message}`)
  const recTickers = new Set<string>()
  for (const r of recs) if (r.ticker_symbol) recTickers.add(String(r.ticker_symbol).toUpperCase())
  console.log(`theme_recommendations tickers: ${recTickers.size}`)

  const targetTickers = new Set<string>([...sp500, ...recTickers])
  const inBoth = [...sp500].filter((t) => recTickers.has(t)).length
  console.log(`target_tickers (union):       ${targetTickers.size} (overlap=${inBoth})`)
  console.log(`  rec-only (not in S&P 500):  ${targetTickers.size - sp500.size}`)

  // 2. Build CIK → ticker map (restricted to target_tickers)
  const cikToTicker = await fetchCikMap()
  console.log(`SEC CIK→ticker mapping:       ${cikToTicker.size} entries`)
  const targetCiks = new Set<string>()
  for (const [cik, ticker] of cikToTicker) {
    if (targetTickers.has(ticker)) targetCiks.add(cik)
  }
  console.log(`target CIKs (resolved):       ${targetCiks.size}`)
  const unresolved = [...targetTickers].filter((t) => ![...cikToTicker.values()].includes(t))
  console.log(`unresolved target tickers:    ${unresolved.length}${unresolved.length > 0 && unresolved.length <= 20 ? ' · ' + unresolved.join(',') : ''}`)

  // 3. Pull Q1 + Q2 form.idx and filter 8-K
  const year = 2026
  const [q1, q2] = await Promise.all([
    fetchIdx(`https://www.sec.gov/Archives/edgar/full-index/${year}/QTR1/form.idx`),
    fetchIdx(`https://www.sec.gov/Archives/edgar/full-index/${year}/QTR2/form.idx`),
  ])
  const all = [...q1, ...q2]
  console.log(`\nall filings Q1+Q2:            ${all.length.toLocaleString()}`)

  // 4. Filter to 8-K in 90-day window
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const eightKsWindow = all.filter((e) =>
    (e.form === '8-K' || e.form.startsWith('8-K/')) && e.date >= cutoff
  )
  console.log(`8-Ks in 90d window (≥${cutoff}): ${eightKsWindow.length.toLocaleString()}`)

  const matched = eightKsWindow.filter((e) => targetCiks.has(e.cik))
  console.log(`8-Ks with target CIK:         ${matched.length.toLocaleString()}`)
  console.log(`pre-filter reduction:         ${((1 - matched.length / eightKsWindow.length) * 100).toFixed(1)}%`)

  // 5. By month window
  const byMonth: Record<string, number> = {}
  for (const e of matched) {
    const monthAgoDays = Math.floor((Date.now() - new Date(e.date).getTime()) / 86400000)
    const bucket = monthAgoDays < 30 ? 'm3 (recent 30d)' : monthAgoDays < 60 ? 'm2 (30-60d)' : 'm1 (60-90d)'
    byMonth[bucket] = (byMonth[bucket] ?? 0) + 1
  }
  console.log(`\n  By monthly bucket:`)
  for (const k of ['m1 (60-90d)', 'm2 (30-60d)', 'm3 (recent 30d)']) {
    console.log(`    ${k.padEnd(20)} ${byMonth[k] ?? 0}`)
  }

  // 6. Sample
  console.log(`\n  First 10 matched 8-Ks:`)
  for (const e of matched.slice(0, 10)) {
    const tk = cikToTicker.get(e.cik)
    console.log(`    ${e.date} · ${tk?.padEnd(6)} · ${e.company.slice(0, 45)}`)
  }

  // 7. Cost
  console.log(`\n=== Cost estimate ===`)
  const perCall = 0.003
  console.log(`Sonnet classifier @ ~$${perCall}/filing:  $${(matched.length * perCall).toFixed(2)}`)
  console.log(`SEC EDGAR request time @ 120ms/filing: ~${Math.round(matched.length * 0.12 / 60)} minutes (single worker)`)
  console.log(`(With concurrency=3, roughly ~${Math.round(matched.length * 0.12 / 60 / 3)} minutes for HTTP fetches)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
