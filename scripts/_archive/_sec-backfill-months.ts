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

async function runMonth(
  label: string,
  startDate: string,  // inclusive
  endDate: string,    // inclusive
  quarterUrls: string[],
  targetCiks: Set<string>,
  cikMap: Map<string, string>,
  existingAccs: Set<string>,
  existingUrls: Set<string>,
): Promise<{ inserted: number; skipped: number; failed: number; failPath?: string }> {
  console.log(`\n=== ${label} · window ${startDate} → ${endDate} ===`)

  // Fetch & merge quarter indexes
  let all: Entry[] = []
  for (const url of quarterUrls) {
    console.log(`  [fetch] ${url}`)
    const txt = await fetchText(url)
    all = all.concat(parseFormIdx(txt))
  }
  const filings = all.filter((e) =>
    (e.form === '8-K' || e.form.startsWith('8-K/')) &&
    e.date >= startDate && e.date <= endDate &&
    targetCiks.has(e.cik)
  )
  console.log(`  filings matched: ${filings.length}`)

  // Dedup — accession OR source_url
  const todo: Entry[] = []
  let skipAcc = 0
  let skipUrl = 0
  for (const e of filings) {
    const acc = e.path.match(/(\d{10}-\d{2}-\d{6})/)?.[1] ?? ''
    if (!acc) continue
    if (existingAccs.has(acc)) { skipAcc++; continue }
    const accNoDash = acc.replace(/-/g, '')
    const url = `https://www.sec.gov/Archives/edgar/data/${e.cik}/${accNoDash}/${acc}-index.htm`
    if (existingUrls.has(url)) { skipUrl++; continue }
    todo.push(e)
  }
  console.log(`  skipped dupe accession: ${skipAcc}`)
  console.log(`  skipped dupe url:       ${skipUrl}`)
  console.log(`  to fetch:               ${todo.length}`)

  const startTs = Date.now()
  const runTag = new Date().toISOString().replace(/[:.]/g, '-') + '-' + label
  if (!existsSync('data/checkpoints')) mkdirSync('data/checkpoints', { recursive: true })

  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const parsed: EventRow[] = []
  const failed: FailLog[] = []
  let done = 0
  let totalInserted = 0

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
      if (r.ok) parsed.push(r.row); else failed.push(r.fail)
    }
    done += batch.length
    if (done % 50 === 0 || done === todo.length) {
      const pct = ((done / Math.max(1, todo.length)) * 100).toFixed(1)
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(0)
      console.log(`    [${pct}%] ${done}/${todo.length} · ok=${parsed.length + totalInserted} fail=${failed.length} · ${elapsed}s`)
    }

    if (parsed.length >= CHECKPOINT_EVERY) {
      const toInsert = parsed.splice(0, parsed.length)
      const { error } = await supabaseAdmin.from('events').insert(toInsert)
      if (error) {
        writeFileSync(`data/checkpoints/sec-${label}-failed-insert-${runTag}.json`, JSON.stringify(toInsert, null, 2))
        throw error
      }
      totalInserted += toInsert.length
      writeFileSync(
        `data/checkpoints/sec-${label}-${runTag}-ckpt-${done}.json`,
        JSON.stringify({ done, total: todo.length, inserted: totalInserted, failed: failed.length }, null, 2)
      )
      console.log(`    ✓ checkpoint: +${toInsert.length} inserted (total ${totalInserted})`)
    }
    await new Promise((r) => setTimeout(r, RATE_DELAY_MS))
  }

  if (parsed.length > 0) {
    const { error } = await supabaseAdmin.from('events').insert(parsed)
    if (error) {
      writeFileSync(`data/checkpoints/sec-${label}-failed-insert-${runTag}.json`, JSON.stringify(parsed, null, 2))
      throw error
    }
    totalInserted += parsed.length
    console.log(`    ✓ final flush: +${parsed.length} (total ${totalInserted})`)
  }

  let failPath: string | undefined
  if (failed.length > 0) {
    failPath = `data/checkpoints/sec-${label}-failures-${runTag}.json`
    writeFileSync(failPath, JSON.stringify(failed, null, 2))
  }

  // Update in-memory dedup sets so later months skip what we just inserted
  for (const r of parsed) {
    try { const rc = JSON.parse(r.raw_content); if (rc.accession_number) existingAccs.add(rc.accession_number) } catch {}
    if (r.source_url) existingUrls.add(r.source_url)
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(0)
  console.log(`  ${label} done: inserted=${totalInserted} skipped=${skipAcc + skipUrl} failed=${failed.length} elapsed=${elapsed}s`)
  return { inserted: totalInserted, skipped: skipAcc + skipUrl, failed: failed.length, failPath }
}

async function main() {
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

  // Build dedup sets from ALL existing SEC 8-K events (including M1 from earlier today)
  const { data: existing } = await supabaseAdmin
    .from('events')
    .select('source_url, raw_content')
    .eq('source_name', SOURCE_NAME)
  const existingAccs = new Set<string>()
  const existingUrls = new Set<string>()
  for (const row of existing ?? []) {
    if (row.source_url) existingUrls.add(row.source_url as string)
    try {
      const rc = JSON.parse((row.raw_content as string) ?? '{}')
      if (rc.accession_number) existingAccs.add(rc.accession_number)
    } catch {}
  }
  console.log(`existing SEC events: ${existing?.length ?? 0} · accessions: ${existingAccs.size} · urls: ${existingUrls.size}`)

  // Month 2: 60→30 days ago from 2026-04-23 → 2026-02-22 → 2026-03-24  (spans Q1/Q2)
  // Month 3: 30→0  days ago → 2026-03-24 → 2026-04-23 (all in Q2)
  const q1Url = `https://www.sec.gov/Archives/edgar/full-index/2026/QTR1/form.idx`
  const q2Url = `https://www.sec.gov/Archives/edgar/full-index/2026/QTR2/form.idx`

  const m2 = await runMonth('M2', '2026-02-23', '2026-03-24', [q1Url, q2Url], targetCiks, cikMap, existingAccs, existingUrls)
  const m3 = await runMonth('M3', '2026-03-25', '2026-04-23', [q2Url],        targetCiks, cikMap, existingAccs, existingUrls)

  console.log(`\n=== Day 4 Final ===`)
  console.log(`  M2: inserted=${m2.inserted} skipped=${m2.skipped} failed=${m2.failed}`)
  console.log(`  M3: inserted=${m3.inserted} skipped=${m3.skipped} failed=${m3.failed}`)
  console.log(`  total inserted: ${m2.inserted + m3.inserted}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
