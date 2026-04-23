import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { runComputeCycleStage } = await import('../lib/compute-cycle-stage')
  console.log('computing cycle stage for active themes...')
  const stats = await runComputeCycleStage()
  console.log(`\ndone · ${stats.themes_updated} themes updated · ${stats.null_stage} null stage`)
  console.log(`alerts: inserted=${stats.alerts_inserted} · deduped=${stats.alerts_deduped} · cold_start_suppressed=${stats.alerts_cold_start_suppressed}`)
  console.log(`severity dist: info=${stats.alert_severity_distribution.info} warn=${stats.alert_severity_distribution.warn} critical=${stats.alert_severity_distribution.critical}`)
  console.log('\ndistribution:')
  for (const k of ['early', 'mid', 'late', 'exit', 'null']) {
    console.log(`  ${k.padEnd(6)}: ${stats.distribution[k] ?? 0}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
