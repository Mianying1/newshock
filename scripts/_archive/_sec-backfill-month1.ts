import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

const UA = 'Newshock Research research@newshock.app'
const SOURCE_NAME = 'SEC EDGAR 8-K Filings'
const ROW_RE = /^(\S+(?:\s+\S+)*?)\s{2,}(.+?)\s{2,}(\d+)\s{2,}(\d{4}-\d{2}-\d{2})\s+(\S+)\s*$/
const CONCURRENCY = 3
const CHECKPOINT_EVERY = 500
const MAX_RETRY = 3
const RATE_DELAY_MS = 120

interface Entry {
  form: string
  company: string
  cik: string
  date: string
  path: string
}

interface EventRow {
  event_date: string
  headline: string
  source_url: string
  source_name: string
  raw_content: string
  mentioned_tickers: string[] | null
}

interface FailLog {
  cik: string
  accession_number: string
  txt_url: string
  error: string
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

async function fetchTextRetry(url: string): Promise<string> {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      return await fetchText(url)
    } catch (e) {
      lastErr = e as Error
      if (attempt < MAX_RETRY) await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  throw lastErr ?? new Error('unknown')
}

async function fetchCikMap(): Promise<Map<string, string>> {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': UA } })
  const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>
  const map = new Map<string, string>()
  for (const v of Object.values(data)) map.set(String(v.cik_str), v.ticker.toUpperCase())
  return map
}

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

function parseEntry(e: Entry, cikMap: Map<string, string>, headerText: string): EventRow {
  const ticker = cikMap.get(e.cik)
  const accession = e.path.match(/(\d{10}-\d{2}-\d{6})/)?.[1] ?? ''
  const accNoDash = accession.replace(/-/g, '')
  const url = accNoDash
    ? `https://www.sec.gov/Archives/edgar/data/${e.cik}/${accNoDash}/${accession}-index.htm`
    : `https://www.sec.gov/Archives/${e.path}`
  const hdrEnd = headerText.indexOf('<DOCUMENT>')
  const header = hdrEnd > 0 ? headerText.slice(0, hdrEnd) : headerText.slice(0, 4000)
  const company = sgmlField(header, 'COMPANY CONFORMED NAME') ?? e.company
  const filingDate = sgmlField(header, 'FILED AS OF DATE')
  const filedDateStr = filingDate && /^\d{8}$/.test(filingDate)
    ? `${filingDate.slice(0, 4)}-${filingDate.slice(4, 6)}-${filingDate.slice(6, 8)}`
    : e.date
  const itemDescriptions = sgmlFieldAll(header, 'ITEM INFORMATION')
  const cikPadded = e.cik.padStart(10, '0')
  const headline = `8-K - ${company} (${cikPadded}) (Filer)`
  return {
    event_date: `${filedDateStr}T12:00:00.000Z`,
    headline,
    source_url: url,
    source_name: SOURCE_NAME,
    raw_content: JSON.stringify({
      accession_number: accession,
      cik: e.cik,
      ticker: ticker ?? null,
      company,
      item_descriptions: itemDescriptions,
    }),
    mentioned_tickers: ticker ? [ticker] : null,
  }
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function main() {
  // 1. Universe
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
  console.log(`target_tickers: ${targetTickers.size} · target_ciks: ${targetCiks.size}`)

  // 2. Month 1 window: 60-90 days back from 2026-04-23
  const today = new Date('2026-04-23')
  const m1Start = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10)
  const m1End = new Date(today.getTime() - 60 * 86400000).toISOString().slice(0, 10)
  console.log(`Month 1 window: ${m1Start} → ${m1End}`)

  const idxText = await fetchText(`https://www.sec.gov/Archives/edgar/full-index/2026/QTR1/form.idx`)
  const all = parseFormIdx(idxText)
  const filings = all.filter((e) =>
    (e.form === '8-K' || e.form.startsWith('8-K/')) &&
    e.date >= m1Start && e.date <= m1End &&
    targetCiks.has(e.cik)
  )
  console.log(`filings to process: ${filings.length}`)

  // 3. Pre-dedup against existing accession_numbers
  console.log(`checking existing accession_numbers ...`)
  const { data: existing } = await supabaseAdmin
    .from('events')
    .select('raw_content')
    .eq('source_name', SOURCE_NAME)
  const existingAccs = new Set<string>()
  for (const row of existing ?? []) {
    try {
      const rc = JSON.parse(row.raw_content as string)
      if (rc.accession_number) existingAccs.add(rc.accession_number)
    } catch {}
  }
  console.log(`existing SEC events: ${existing?.length ?? 0} · unique accessions: ${existingAccs.size}`)
  const todo = filings.filter((e) => {
    const acc = e.path.match(/(\d{10}-\d{2}-\d{6})/)?.[1] ?? ''
    return acc && !existingAccs.has(acc)
  })
  console.log(`new filings to fetch: ${todo.length} (skipped ${filings.length - todo.length} dupes)`)

  // 4. Fetch + parse with concurrency
  const startTs = Date.now()
  const runTag = new Date().toISOString().replace(/[:.]/g, '-')
  if (!existsSync('data/checkpoints')) mkdirSync('data/checkpoints', { recursive: true })

  const parsed: EventRow[] = []
  const failed: FailLog[] = []
  let done = 0

  for (const batch of chunks(todo, CONCURRENCY)) {
    const results = await Promise.all(
      batch.map(async (e) => {
        const txtUrl = `https://www.sec.gov/Archives/${e.path}`
        const accession = e.path.match(/(\d{10}-\d{2}-\d{6})/)?.[1] ?? ''
        try {
          const txt = await fetchTextRetry(txtUrl)
          return { ok: true as const, row: parseEntry(e, cikMap, txt) }
        } catch (err) {
          return {
            ok: false as const,
            fail: { cik: e.cik, accession_number: accession, txt_url: txtUrl, error: (err as Error).message },
          }
        }
      })
    )
    for (const r of results) {
      if (r.ok) parsed.push(r.row)
      else failed.push(r.fail)
    }
    done += batch.length
    if (done % 50 === 0 || done === todo.length) {
      const pct = ((done / todo.length) * 100).toFixed(1)
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(0)
      console.log(`  [${pct}%] ${done}/${todo.length} · ok=${parsed.length} fail=${failed.length} · ${elapsed}s`)
    }

    // Checkpoint + flush every CHECKPOINT_EVERY
    if (parsed.length >= CHECKPOINT_EVERY) {
      const toInsert = parsed.splice(0, parsed.length)
      const { error } = await supabaseAdmin.from('events').insert(toInsert)
      if (error) {
        console.error(`  INSERT ERROR: ${error.message}`)
        writeFileSync(
          `data/checkpoints/sec-m1-failed-insert-${runTag}.json`,
          JSON.stringify(toInsert, null, 2)
        )
        throw error
      }
      writeFileSync(
        `data/checkpoints/sec-m1-${runTag}-ckpt-${done}.json`,
        JSON.stringify({ done, total: todo.length, inserted: toInsert.length, failed: failed.length }, null, 2)
      )
      console.log(`  ✓ checkpoint: flushed ${toInsert.length} to DB`)
    }

    await new Promise((r) => setTimeout(r, RATE_DELAY_MS))
  }

  // 5. Final flush
  if (parsed.length > 0) {
    const { error } = await supabaseAdmin.from('events').insert(parsed)
    if (error) {
      console.error(`  FINAL INSERT ERROR: ${error.message}`)
      writeFileSync(
        `data/checkpoints/sec-m1-failed-insert-${runTag}.json`,
        JSON.stringify(parsed, null, 2)
      )
      throw error
    }
    console.log(`  ✓ final flush: ${parsed.length} rows inserted`)
  }

  // 6. Failure log
  if (failed.length > 0) {
    const failPath = `data/checkpoints/sec-m1-failures-${runTag}.json`
    writeFileSync(failPath, JSON.stringify(failed, null, 2))
    console.log(`  ✗ ${failed.length} failures logged to ${failPath}`)
  }

  // 7. Final report
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(0)
  console.log(`\n=== Final ===`)
  console.log(`  window:          ${m1Start} → ${m1End}`)
  console.log(`  matched filings: ${filings.length}`)
  console.log(`  skipped dupes:   ${filings.length - todo.length}`)
  console.log(`  attempted:       ${todo.length}`)
  console.log(`  inserted:        ${todo.length - failed.length}`)
  console.log(`  failed:          ${failed.length}`)
  console.log(`  elapsed:         ${elapsed}s`)
  console.log(`  run_tag:         ${runTag}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
