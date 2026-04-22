import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { generateThemesForPendingEvents } = await import('../lib/theme-generator')

  console.log('━━ Backfill orphan events ━━\n')

  let totalProcessed = 0
  let totalNewThemes = 0
  let totalStrengthen = 0
  let totalExploratory = 0
  let totalIrrelevant = 0
  let totalNoMatch = 0
  let iteration = 0

  while (true) {
    iteration++
    console.log(`\n[Iteration ${iteration}] Processing batch of 30 (rate_limit=2)...`)

    const result = await generateThemesForPendingEvents({ limit: 30, rate_limit: 2 })

    console.log(`  Processed:        ${result.processed}`)
    console.log(`  strengthen:       ${result.strengthen_existing}`)
    console.log(`  new_from_arch:    ${result.new_from_archetype}`)
    console.log(`  new_exploratory:  ${result.new_exploratory}`)
    console.log(`  irrelevant:       ${result.irrelevant}`)
    console.log(`  deferred_sec:     ${result.deferred_sec}`)
    console.log(`  errors:           ${result.errors}`)
    console.log(`  themes_created:   ${result.themes_created}`)
    console.log(`  recs_created:     ${result.recommendations_created}`)

    if (result.exploratory_details?.length > 0) {
      console.log('  New exploratory themes:')
      result.exploratory_details.forEach((e) => {
        console.log(`    • ${e.theme_name} (conf ${e.confidence})`)
      })
    }

    totalProcessed += result.processed
    totalNewThemes += result.themes_created
    totalStrengthen += result.strengthen_existing
    totalExploratory += result.new_exploratory
    totalIrrelevant += result.irrelevant
    totalNoMatch += result.new_from_archetype

    if (result.processed === 0) {
      console.log('\n✅ Queue empty. Done.')
      break
    }

    if (iteration >= 10) {
      console.log('\n⚠️ Stopped at 10 iterations (safety limit)')
      break
    }

    await new Promise((r) => setTimeout(r, 30000))
  }

  console.log('\n━━ Summary ━━')
  console.log(`  Iterations:      ${iteration}`)
  console.log(`  Total processed: ${totalProcessed}`)
  console.log(`  Total strengthen:     ${totalStrengthen}`)
  console.log(`  Total new_from_arch:  ${totalNoMatch}`)
  console.log(`  Total exploratory:    ${totalExploratory}`)
  console.log(`  Total irrelevant:     ${totalIrrelevant}`)
  console.log(`  Total themes created: ${totalNewThemes}`)
}

main().catch(console.error)
