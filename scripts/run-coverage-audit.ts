import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { runCoverageAudit } = await import('../lib/coverage-audit')
  console.log('Running coverage audit…')
  const report = await runCoverageAudit()

  console.log('\n=== COVERAGE AUDIT REPORT ===')
  console.log('Report date:', report.report_date)
  console.log('Active archetypes:', report.active_archetype_count)
  console.log('Unmatched events (14d):', report.unmatched_events_count)
  console.log('Market regime:', report.market_regime_label ?? 'n/a',
    report.market_regime_score != null ? `(${report.market_regime_score}/12)` : '')

  console.log('\n--- Overall assessment (EN) ---')
  console.log(report.overall_assessment)
  console.log('\n--- 总体评价 (ZH) ---')
  console.log(report.overall_assessment_zh)

  console.log(`\n--- Suggested new archetypes (${report.suggested_new_archetypes.length}) ---`)
  report.suggested_new_archetypes.forEach((a, i) => {
    console.log(`\n[${i + 1}] ${a.name} · ${a.name_zh}`)
    console.log(`    priority: ${a.priority} · category: ${a.category} · duration: ${a.duration_type}`)
    console.log(`    tickers: ${a.suggested_tickers.join(', ')}`)
    console.log(`    why: ${a.reasoning}`)
  })

  console.log(`\n--- Suggested mergers (${report.suggested_mergers.length}) ---`)
  report.suggested_mergers.forEach((m, i) => {
    console.log(`\n[${i + 1}] → ${m.proposed_umbrella_name}`)
    console.log(`    merges: ${m.existing_archetype_ids.join(', ')}`)
    console.log(`    why: ${m.reasoning}`)
  })

  console.log(`\n--- Rebalancing notes (${report.suggested_rebalancing.length}) ---`)
  report.suggested_rebalancing.forEach((r, i) => {
    console.log(`\n[${i + 1}] ${r.observation}`)
    console.log(`    → ${r.recommendation}`)
  })

  console.log('\n=== END ===\n')
  console.log('Report id:', report.id)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('audit failed:', e)
    process.exit(1)
  })
