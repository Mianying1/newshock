import { config } from 'dotenv'
config({ path: '.env.local' })

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

async function main() {
  const year = 2026
  const qtr = 'QTR2'
  const url = `https://www.sec.gov/Archives/edgar/full-index/${year}/${qtr}/form.idx`
  console.log(`Fetching ${url} ...`)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) {
    console.error(`HTTP ${res.status} from SEC`)
    process.exit(1)
  }
  const text = await res.text()
  console.log(`Got ${text.length.toLocaleString()} bytes · parsing ...`)

  const entries = parseFormIdx(text)
  console.log(`Parsed ${entries.length.toLocaleString()} filings in ${year} ${qtr} (all forms)\n`)

  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const weekly = entries.filter((e) => e.date >= cutoff)
  console.log(`Last 7 days (since ${cutoff}): ${weekly.length.toLocaleString()} filings (all forms)`)

  const byForm: Record<string, number> = {}
  for (const e of weekly) byForm[e.form] = (byForm[e.form] ?? 0) + 1

  console.log('\n  Form type distribution (last 7 days):')
  const sorted = Object.entries(byForm).sort((a, b) => b[1] - a[1]).slice(0, 15)
  for (const [f, n] of sorted) console.log(`    ${f.padEnd(14)} ${String(n).padStart(6)}`)

  const eightKs = weekly.filter((e) => e.form === '8-K' || e.form.startsWith('8-K/'))
  console.log(`\n  8-K only (last 7 days): ${eightKs.length.toLocaleString()}`)

  const byDate: Record<string, number> = {}
  for (const e of eightKs) byDate[e.date] = (byDate[e.date] ?? 0) + 1
  console.log(`\n  8-K daily distribution:`)
  for (const [d, n] of Object.entries(byDate).sort()) console.log(`    ${d}   ${n}`)

  console.log(`\n  First 5 8-K samples:`)
  for (const e of eightKs.slice(0, 5)) {
    console.log(`    ${e.date} · CIK ${e.cik} · ${e.company.slice(0, 50)}`)
    console.log(`           ${e.path}`)
  }

  console.log(`\n  90-day extrapolation: ~${Math.round(eightKs.length * (90 / 7)).toLocaleString()} 8-Ks`)
}

main().catch((e) => { console.error(e); process.exit(1) })
