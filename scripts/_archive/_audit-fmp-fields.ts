import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  const rows: Array<{ headline: string; source_url: string | null; event_date: string | null; raw_content: string | null; mentioned_tickers: string[] | null }> = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('headline, source_url, event_date, raw_content, mentioned_tickers')
      .ilike('source_name', 'FMP Backfill%')
      .range(from, from + pageSize - 1)
    if (error) { console.error(error); process.exit(1) }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  console.log(`fetched ${rows.length} FMP Backfill rows\n`)

  // event_date precision
  const uniqTimes = new Set(rows.map((r) => (r.event_date ?? '').slice(11, 19)))
  console.log(`event_date distinct hh:mm:ss values: ${uniqTimes.size}`)
  console.log(`  samples: ${[...uniqTimes].slice(0, 10).join(', ')}`)
  const midnight = rows.filter((r) => (r.event_date ?? '').slice(11, 19) === '00:00:00').length
  console.log(`  rows with 00:00:00 time: ${midnight}/${rows.length}`)

  // source_url hostnames
  const hosts = new Set<string>()
  for (const r of rows) { try { hosts.add(new URL(r.source_url ?? '').hostname) } catch { /* skip */ } }
  console.log(`\nsource_url distinct hostnames: ${hosts.size}`)
  console.log(`  top: ${[...hosts].slice(0, 12).join(', ')}${hosts.size > 12 ? '...' : ''}`)

  // headline pattern
  const samples = rows.slice(0, 5).map((r) => r.headline)
  console.log(`\nheadline samples:`)
  for (const s of samples) console.log(`  ${s.slice(0, 90)}`)

  // raw_content type
  const nonEmpty = rows.filter((r) => (r.raw_content ?? '').length > 0).length
  const isJson = rows.filter((r) => {
    try { const v = JSON.parse(r.raw_content ?? ''); return v && typeof v === 'object' && !Array.isArray(v) } catch { return false }
  }).length
  console.log(`\nraw_content:`)
  console.log(`  non-empty: ${nonEmpty}/${rows.length}`)
  console.log(`  json-obj:  ${isJson}/${rows.length}`)
  const rawSample = rows.find((r) => (r.raw_content ?? '').length > 0)
  if (rawSample) console.log(`  sample (plain text): ${(rawSample.raw_content ?? '').slice(0, 120)}`)

  // mentioned_tickers
  const nullTix = rows.filter((r) => r.mentioned_tickers == null).length
  const emptyTix = rows.filter((r) => Array.isArray(r.mentioned_tickers) && r.mentioned_tickers.length === 0).length
  const nonEmptyTix = rows.filter((r) => Array.isArray(r.mentioned_tickers) && r.mentioned_tickers.length > 0).length
  console.log(`\nmentioned_tickers:`)
  console.log(`  null:      ${nullTix}`)
  console.log(`  empty []:  ${emptyTix}`)
  console.log(`  non-empty: ${nonEmptyTix}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
