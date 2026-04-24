import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  const data: Array<{ headline: string; source_url: string | null; event_date: string | null; raw_content: string | null; created_at: string | null }> = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabaseAdmin
      .from('events')
      .select('headline, source_url, event_date, raw_content, created_at')
      .eq('source_name', 'SEC EDGAR 8-K Filings')
      .range(from, from + pageSize - 1)
    if (error) { console.error(error); process.exit(1) }
    if (!page || page.length === 0) break
    data.push(...page)
    if (page.length < pageSize) break
  }
  console.log(`fetched ${data.length} SEC rows\n`)

  const realtime = data.filter((r) => /^8-K/.test(r.headline))
  const backfill = data.filter((r) => /\sfiles\s8-K/.test(r.headline))
  const other = data.filter((r) => !/^8-K/.test(r.headline) && !/\sfiles\s8-K/.test(r.headline))
  console.log(`realtime rows: ${realtime.length}`)
  console.log(`backfill rows: ${backfill.length}`)
  console.log(`other rows:    ${other.length}\n`)

  function summarize(label: string, rows: typeof data) {
    if (rows.length === 0) { console.log(`== ${label}: 0 rows ==\n`); return }
    console.log(`== ${label} · n=${rows.length} ==`)
    // source_url
    const urls = rows.map((r) => r.source_url ?? '')
    const urlSample = urls.slice(0, 3)
    const hasAccession = urls.filter((u) => /\d{10}-\d{2}-\d{6}/.test(u)).length
    const hostnames = new Set<string>()
    for (const u of urls) { try { hostnames.add(new URL(u).hostname) } catch { /* skip */ } }
    console.log(`  source_url:`)
    console.log(`    hostnames: ${[...hostnames].join(', ')}`)
    console.log(`    has accession pattern: ${hasAccession}/${rows.length}`)
    console.log(`    sample: ${urlSample.map((u) => u.slice(0, 80)).join('\n            ')}`)

    // event_date — timezone / precision
    const dates = rows.map((r) => r.event_date ?? '').filter(Boolean)
    const uniqTimes = new Set(dates.map((d) => d.slice(11, 16)))
    console.log(`  event_date:`)
    console.log(`    distinct hh:mm values: ${uniqTimes.size}${uniqTimes.size <= 10 ? ' · ' + [...uniqTimes].join(',') : ''}`)
    console.log(`    earliest: ${dates.sort()[0]}`)
    console.log(`    latest:   ${dates.sort().slice(-1)[0]}`)
    const withZ = dates.filter((d) => d.endsWith('Z')).length
    const withOffset = dates.filter((d) => /[+\-]\d\d:\d\d$/.test(d)).length
    console.log(`    tz: ${withZ} 'Z'-suffixed · ${withOffset} offset-suffixed`)

    // raw_content structure
    const rawSamples = rows.map((r) => r.raw_content ?? '')
    const nonEmpty = rawSamples.filter((r) => r.length > 0).length
    const jsonParseable = rawSamples.filter((r) => {
      try { const v = JSON.parse(r); return v && typeof v === 'object' && !Array.isArray(v) } catch { return false }
    }).length
    const keys = new Map<string, number>()
    for (const r of rawSamples) {
      try {
        const v = JSON.parse(r)
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          for (const k of Object.keys(v)) keys.set(k, (keys.get(k) ?? 0) + 1)
        }
      } catch { /* skip */ }
    }
    console.log(`  raw_content:`)
    console.log(`    non-empty:       ${nonEmpty}/${rows.length}`)
    console.log(`    json-object:     ${jsonParseable}/${rows.length}`)
    if (keys.size > 0) {
      console.log(`    json keys: ${[...keys.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}(${n})`).join(', ')}`)
    } else {
      const firstSample = rawSamples.find((r) => r.length > 0) ?? ''
      console.log(`    sample: ${firstSample.slice(0, 120)}`)
    }

    console.log('')
  }

  summarize('REALTIME (headline ^8-K)', realtime)
  summarize('BACKFILL (headline "... files 8-K")', backfill)
  if (other.length > 0) summarize('OTHER', other)
}

main().catch((e) => { console.error(e); process.exit(1) })
