import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { runComputeTickerMaturity } = await import('../lib/compute-ticker-maturity')
  console.log('computing ticker maturity...')
  const stats = await runComputeTickerMaturity()
  console.log(`\ndone · ${stats.scored_count} tickers · ${stats.updated_rows} rows updated`)
  console.log('\ntop 5:')
  for (const s of stats.top_5) console.log(`  ${s.ticker} · score=${s.score.toFixed(2)}`)
  console.log('\nbottom 5:')
  for (const s of stats.bottom_5) console.log(`  ${s.ticker} · score=${s.score.toFixed(2)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
