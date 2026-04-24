import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const apikey = process.env.FMP_API_KEY!
  const base = 'https://financialmodelingprep.com/stable'
  // Scan pages 0,10,30,60,120 — see how old they go
  for (const page of [0, 10, 30, 60, 120, 200]) {
    const params = new URLSearchParams({ page: String(page), limit: '5', apikey })
    const res = await fetch(`${base}/news/stock-latest?${params}`)
    const data = (await res.json()) as Array<{ publishedDate: string; title: string }>
    console.log(`\n  page=${page} · ${res.status} · returned=${data.length}`)
    if (data.length) {
      console.log(`    oldest: ${data[data.length - 1]?.publishedDate} · ${data[data.length - 1]?.title?.slice(0, 70)}`)
      console.log(`    newest: ${data[0]?.publishedDate} · ${data[0]?.title?.slice(0, 70)}`)
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  // Also probe with keyword 'data center power' for crude hit count in first 20 pages
  console.log(`\n\n=== substring hit audit ===`)
  const kws = ['data center power', 'ai power consumption', 'hyperscaler ppa', 'compute power demand', 'data center electricity']
  const seen = new Set<string>()
  const hits: { page: number; date: string; kw: string; title: string }[] = []
  for (let p = 0; p < 20; p++) {
    const params = new URLSearchParams({ page: String(p), limit: '100', apikey })
    const res = await fetch(`${base}/news/stock-latest?${params}`)
    const data = (await res.json()) as Array<{ publishedDate: string; title: string; text: string; url: string }>
    if (!Array.isArray(data) || data.length === 0) break
    for (const item of data) {
      if (seen.has(item.url)) continue
      seen.add(item.url)
      const text = ((item.title ?? '') + ' ' + (item.text ?? '')).toLowerCase()
      for (const kw of kws) {
        if (text.includes(kw)) hits.push({ page: p, date: item.publishedDate, kw, title: item.title })
      }
    }
  }
  console.log(`  scanned ~20 pages · ${seen.size} unique items`)
  console.log(`  hits: ${hits.length}`)
  for (const h of hits.slice(0, 10)) console.log(`    [p${h.page}] ${h.date} · "${h.kw}" · ${h.title?.slice(0, 70)}`)

  // Broader flex matching: any single word from keywords
  console.log(`\n=== broader: presence of BOTH 'data center' AND 'power' ===`)
  let b = 0
  for (const it of seen) {}  // unused iteration
  // Re-scan with looser AND condition
  let broadHits = 0
  let c = 0
  for (let p = 0; p < 10; p++) {
    const params = new URLSearchParams({ page: String(p), limit: '100', apikey })
    const res = await fetch(`${base}/news/stock-latest?${params}`)
    const data = (await res.json()) as Array<{ publishedDate: string; title: string; text: string; url: string }>
    if (!Array.isArray(data) || data.length === 0) break
    for (const item of data) {
      c++
      const text = ((item.title ?? '') + ' ' + (item.text ?? '')).toLowerCase()
      if (text.includes('data center') && text.includes('power')) broadHits++
    }
  }
  console.log(`  scanned ${c} items in 10 pages · hits (data center AND power): ${broadHits}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
