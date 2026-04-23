import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { runComputeSentimentScore } = await import('../lib/compute-sentiment-score')
  console.log('computing sentiment for active themes...')
  const stats = await runComputeSentimentScore()
  console.log(`\ndone · ${stats.themes_updated} themes updated`)
  console.log('\ndistribution:')
  const total = stats.themes_updated || 1
  for (const k of ['bullish', 'mixed', 'bearish', 'neutral']) {
    const v = stats.distribution[k] ?? 0
    const pct = ((v / total) * 100).toFixed(0)
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(3)} (${pct}%)`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
