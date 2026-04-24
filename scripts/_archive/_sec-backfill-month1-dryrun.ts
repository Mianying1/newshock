import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync } from 'fs'

const UA = 'Newshock Research research@newshock.app'
const ROW_RE = /^(\S+(?:\s+\S+)*?)\s{2,}(.+?)\s{2,}(\d+)\s{2,}(\d{4}-\d{2}-\d{2})\s+(\S+)\s*$/

interface Entry {
  form: string
  company: string
  cik: string
  date: string
  path: string
}

interface Parsed {
  cik: string
  ticker: string | undefined
  filing_date: string
  accession_number: string
  company: string
  form: string
  item_descriptions: string[]
  headline: string
  url: string
  txt_url: string
  ok: boolean
  error?: string
}

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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchCikMap(): Promise<Map<string, string>> {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': UA } })
  const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>
  const map = new Map<string, string>()
  for (const v of Object.values(data)) map.set(String(v.cik_str), v.ticker.toUpperCase())
  return map
}

// SGML header is tabbed plain text: `FIELD NAME:\t\tvalue`
function sgmlField(hdr: string, label: string): string | undefined {
  const re = new RegExp(`^${label}:\\s+(.+)$`, 'mi')
  const m = hdr.match(re)
  return m?.[1].trim()
}

function sgmlFieldAll(hdr: string, label: string): string[] {
  const re = new RegExp(`^${label}:\\s+(.+)$`, 'gmi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(hdr)) !== null) out.push(m[1].trim())
  return out
}

async function parseFiling(e: Entry, cikMap: Map<string, string>): Promise<Parsed> {
  const ticker = cikMap.get(e.cik)
  const accession = e.path.match(/(\d{10}-\d{2}-\d{6})/)?.[1] ?? ''
  const accNoDash = accession.replace(/-/g, '')
  const txt_url = `https://www.sec.gov/Archives/${e.path}`
  const url = accNoDash
    ? `https://www.sec.gov/Archives/edgar/data/${e.cik}/${accNoDash}/${accession}-index.htm`
    : txt_url

  try {
    const txt = await fetchText(txt_url)
    // Header is before first <DOCUMENT>
    const hdrEnd = txt.indexOf('<DOCUMENT>')
    const header = hdrEnd > 0 ? txt.slice(0, hdrEnd) : txt.slice(0, 4000)
    const company = sgmlField(header, 'COMPANY CONFORMED NAME') ?? e.company
    const form = sgmlField(header, 'CONFORMED SUBMISSION TYPE') ?? sgmlField(header, 'FORM TYPE') ?? e.form
    const filingDate = sgmlField(header, 'FILED AS OF DATE')
    const filedDateStr = filingDate && /^\d{8}$/.test(filingDate)
      ? `${filingDate.slice(0, 4)}-${filingDate.slice(4, 6)}-${filingDate.slice(6, 8)}`
      : e.date
    const itemDescriptions = sgmlFieldAll(header, 'ITEM INFORMATION')
    const headline = itemDescriptions.length
      ? `${company} files 8-K: ${itemDescriptions.join(' | ')}`
      : `${company} files 8-K`
    return {
      cik: e.cik, ticker, filing_date: filedDateStr, accession_number: accession,
      company, form, item_descriptions: itemDescriptions, headline, url, txt_url, ok: true,
    }
  } catch (err) {
    return {
      cik: e.cik, ticker, filing_date: e.date, accession_number: accession,
      company: e.company, form: e.form, item_descriptions: [], headline: '', url, txt_url,
      ok: false, error: (err as Error).message,
    }
  }
}

async function main() {
  // Load same universe as prefilter
  const sp500 = new Set(
    readFileSync('data/sp500-tickers.txt', 'utf8')
      .split('\n').map((l) => l.trim()).filter(Boolean)
  )
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data: recs } = await supabaseAdmin.from('theme_recommendations').select('ticker_symbol')
  const recTickers = new Set<string>()
  for (const r of recs ?? []) if (r.ticker_symbol) recTickers.add(String(r.ticker_symbol).toUpperCase())
  const targetTickers = new Set<string>([...sp500, ...recTickers])

  const cikMap = await fetchCikMap()
  const targetCiks = new Set<string>()
  for (const [c, t] of cikMap) if (targetTickers.has(t)) targetCiks.add(c)

  // Month 1 window: 60-90 days back
  const today = new Date('2026-04-23')
  const m1Start = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10)
  const m1End = new Date(today.getTime() - 60 * 86400000).toISOString().slice(0, 10)
  console.log(`Month 1 window: ${m1Start} → ${m1End}`)

  // Fetch Q1 form.idx (month 1 is in Q1)
  const idxText = await fetchText(`https://www.sec.gov/Archives/edgar/full-index/2026/QTR1/form.idx`)
  const all = parseFormIdx(idxText)
  const m1 = all.filter((e) =>
    (e.form === '8-K' || e.form.startsWith('8-K/')) &&
    e.date >= m1Start && e.date <= m1End &&
    targetCiks.has(e.cik)
  )
  console.log(`Month 1 matched 8-Ks: ${m1.length}`)

  // Random sample 20
  const shuffled = [...m1].sort(() => Math.random() - 0.5)
  const sample = shuffled.slice(0, 20)
  console.log(`\nSampling ${sample.length} random filings (concurrency=3, 120ms delay)...\n`)

  const results: Parsed[] = []
  const CONCURRENCY = 3
  for (let i = 0; i < sample.length; i += CONCURRENCY) {
    const batch = sample.slice(i, i + CONCURRENCY)
    const parsed = await Promise.all(batch.map((e) => parseFiling(e, cikMap)))
    results.push(...parsed)
    for (const p of parsed) {
      const mark = p.ok ? 'OK' : 'FAIL'
      const tk = p.ticker ?? '?'
      console.log(`[${mark}] ${p.filing_date} · ${tk.padEnd(6)} · items=${p.item_descriptions.length} · ${p.headline.slice(0, 90)}${p.error ? ' · ERR: ' + p.error : ''}`)
    }
    await new Promise((r) => setTimeout(r, 120))
  }

  const okCount = results.filter((r) => r.ok).length
  console.log(`\n=== Summary ===`)
  console.log(`  Success:          ${okCount}/${results.length}`)
  console.log(`  Failed:           ${results.length - okCount}`)
  console.log(`  With items:       ${results.filter((r) => r.ok && r.item_descriptions.length).length}`)
  console.log(`  Without items:    ${results.filter((r) => r.ok && !r.item_descriptions.length).length}`)

  // Item description distribution (top keywords)
  const descFreq: Record<string, number> = {}
  for (const r of results) for (const d of r.item_descriptions) descFreq[d] = (descFreq[d] ?? 0) + 1
  console.log(`\n  Item description distribution:`)
  for (const [d, n] of Object.entries(descFreq).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    [${n}] ${d.slice(0, 90)}`)
  }

  // 5 random full samples
  console.log(`\n=== 5 random full samples (JSON) ===`)
  const fullSamples = [...results].sort(() => Math.random() - 0.5).slice(0, 5)
  for (const s of fullSamples) {
    const out = {
      cik: s.cik, ticker: s.ticker, filing_date: s.filing_date,
      accession_number: s.accession_number, headline: s.headline,
      item_descriptions: s.item_descriptions, url: s.url,
    }
    console.log(JSON.stringify(out, null, 2))
  }

  // Time estimate for real run of 694
  const elapsed = (sample.length * 120) / CONCURRENCY + sample.length * 300 // rough: 300ms per fetch
  console.log(`\n=== Real-run time estimate (694 filings) ===`)
  console.log(`  @ concurrency=3, ~450ms/filing avg: ~${Math.round(694 * 450 / 3 / 1000)} sec = ~${Math.round(694 * 450 / 3 / 60000)} min`)
}

main().catch((e) => { console.error(e); process.exit(1) })
