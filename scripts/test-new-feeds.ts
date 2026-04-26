import { fetchAllSources } from '../lib/news-fetcher'
import { NEWS_SOURCES } from '../lib/news-sources'

async function main() {
  console.log(`Testing ${NEWS_SOURCES.length} sources (dry-run, no DB insert)...\n`)
  const start = Date.now()
  const { items, sourceResults } = await fetchAllSources()
  const duration = ((Date.now() - start) / 1000).toFixed(1)

  sourceResults.sort((a, b) => b.fetched - a.fetched)

  console.log(`source                        fetched  err`)
  console.log(`------------------------------------------`)
  for (const r of sourceResults) {
    const mark = r.fetched > 0 ? '✓' : '✗'
    console.log(`${mark} ${r.id.padEnd(28)} ${String(r.fetched).padStart(5)}    ${r.errors.length}`)
    if (r.errors.length) console.log(`    ↳ ${r.errors.join(' | ').slice(0, 180)}`)
  }
  console.log(`------------------------------------------`)
  console.log(`total items: ${items.length} | duration: ${duration}s`)
  const silent = sourceResults.filter((r) => r.fetched === 0)
  if (silent.length) {
    console.log(`\n⚠ Silent sources: ${silent.map((s) => s.id).join(', ')}`)
  } else {
    console.log(`\n✓ All ${sourceResults.length} sources returned items`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
