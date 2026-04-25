import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { runExitSignalDetection } = await import('../lib/exit-signal-detector')
  console.log('detecting exit-signal triggers (rule-based)...')
  const t0 = Date.now()
  const stats = await runExitSignalDetection()
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`\ndone in ${elapsed}s`)
  console.log(`themes processed: ${stats.themes_processed} (failed: ${stats.themes_failed})`)
  console.log(`signals total:    ${stats.signals_total}`)
  console.log(`\nby rule type:`)
  for (const k of ['event_count', 'stale', 'manual_review'] as const) {
    const v = stats.by_rule[k] ?? 0
    const pct = stats.signals_total ? ((v / stats.signals_total) * 100).toFixed(0) : '0'
    console.log(`  ${k.padEnd(15)}: ${String(v).padStart(3)} (${pct}%)`)
  }
  console.log(`\nby status:`)
  for (const k of ['not_triggered', 'triggered', 'manual_review'] as const) {
    const v = stats.by_status[k] ?? 0
    const pct = stats.signals_total ? ((v / stats.signals_total) * 100).toFixed(0) : '0'
    console.log(`  ${k.padEnd(15)}: ${String(v).padStart(3)} (${pct}%)`)
  }
  if (stats.failures.length > 0) {
    console.log(`\nfailures:`)
    for (const f of stats.failures) console.log(`  ${f.theme_id}: ${f.error}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
