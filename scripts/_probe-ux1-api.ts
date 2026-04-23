import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { getLongShortTickers, getApprovedNewAngles } = await import('../lib/ticker-scoring')

  const longRows = await getLongShortTickers('long', 10)
  console.log(`=== LONG (${longRows.length}) ===`)
  for (const r of longRows.slice(0, 8)) {
    console.log(`  ${r.symbol.padEnd(6)} score=${r.ticker_maturity_score?.toFixed(2)} type=${r.ticker_type} sent=${r.dominant_sentiment ?? '-'} dt=${r.duration_type} · ${r.theme_name.slice(0, 50)}`)
  }

  const shortRows = await getLongShortTickers('short', 10)
  console.log(`\n=== SHORT (${shortRows.length}) ===`)
  for (const r of shortRows.slice(0, 8)) {
    console.log(`  ${r.symbol.padEnd(6)} score=${r.ticker_maturity_score?.toFixed(2)} type=${r.ticker_type} sent=${r.dominant_sentiment ?? '-'} dt=${r.duration_type} · ${r.theme_name.slice(0, 50)}`)
  }

  const angles = await getApprovedNewAngles(10)
  console.log(`\n=== NEW ANGLES (${angles.length}) ===`)
  for (const a of angles.slice(0, 8)) {
    const badge = a.reviewed_at ? '' : ' 🤖'
    console.log(`  conf=${a.confidence?.toFixed(2)}${badge} · ${a.angle_label} · umbrella=${a.umbrella_theme_name.slice(0, 40)} · tickers=${a.proposed_tickers.slice(0, 3).join(',')}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
