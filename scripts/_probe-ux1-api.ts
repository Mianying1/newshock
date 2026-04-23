import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { getLongShortTickers, getApprovedNewAngles } = await import('../lib/ticker-scoring')

  const longRows = await getLongShortTickers('long', 20)
  console.log(`=== LONG · dedup=${new Set(longRows.map(r => r.symbol)).size === longRows.length ? 'OK' : 'FAIL'} (${longRows.length}) ===`)
  for (const r of longRows.slice(0, 10)) {
    console.log(`  ${r.symbol.padEnd(6)} score=${r.ticker_maturity_score?.toFixed(2)} type=${r.ticker_type} sent=${r.dominant_sentiment ?? '-'} dt=${r.duration_type} · ${r.theme_name.slice(0, 50)}`)
  }

  const shortRows = await getLongShortTickers('short', 20)
  console.log(`\n=== SHORT · dedup=${new Set(shortRows.map(r => r.symbol)).size === shortRows.length ? 'OK' : 'FAIL'} (${shortRows.length}) ===`)
  for (const r of shortRows.slice(0, 10)) {
    console.log(`  ${r.symbol.padEnd(6)} score=${r.ticker_maturity_score?.toFixed(2)} type=${r.ticker_type} sent=${r.dominant_sentiment ?? '-'} dt=${r.duration_type} · ${r.theme_name.slice(0, 50)}`)
  }

  const angles = await getApprovedNewAngles(50)
  console.log(`\n=== ANGLE DIRECTIONS (${angles.length}) ===`)
  const perUmbrella = new Map<string, number>()
  for (const a of angles) {
    perUmbrella.set(a.umbrella_name, (perUmbrella.get(a.umbrella_name) ?? 0) + 1)
  }
  const maxPerUmbrella = Math.max(0, ...perUmbrella.values())
  console.log(`  per-umbrella cap check: max=${maxPerUmbrella} (should be <= 3)`)
  console.log(`  umbrella spread: ${perUmbrella.size} distinct umbrellas`)
  for (const a of angles.slice(0, 12)) {
    const badge = a.is_ai_pending ? ' 🤖' : ''
    console.log(`  ${a.ticker_symbol.padEnd(6)} conf=${a.confidence?.toFixed(2)}${badge} · ${a.last_event_days_ago}d · ${a.angle_label.slice(0, 40)} · umbrella=${a.umbrella_name.slice(0, 40)}`)
  }
  const iran = angles.filter(a => /iran|hormuz|red sea/i.test(a.umbrella_name))
  console.log(`\n  Iran/bounded-crisis filter: ${iran.length === 0 ? 'OK (none)' : `FAIL (${iran.length} leaked)`}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
