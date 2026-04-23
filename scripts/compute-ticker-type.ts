import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { runComputeTickerType } = await import('../lib/compute-ticker-type')
  console.log('classifying recommendations...')
  const stats = await runComputeTickerType()
  console.log(`\ndone · ${stats.updated_rows} rows updated`)
  console.log('\ndistribution:')
  for (const k of ['core_hold', 'short_catalyst', 'golden_leap', 'watch', 'null']) {
    const v = stats.distribution[k] ?? 0
    const pct = stats.updated_rows ? ((v / stats.updated_rows) * 100).toFixed(0) : '0'
    console.log(`  ${k.padEnd(15)}: ${String(v).padStart(3)} (${pct}%)`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
