import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { classifyAllUnclassified } = await import('../lib/counter-evidence')
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { count: totalUnclassified } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .not('trigger_theme_id', 'is', null)
    .is('supports_or_contradicts', null)

  console.log(`[backfill] unclassified events with trigger_theme_id: ${totalUnclassified ?? 0}`)
  console.log('[backfill] starting Haiku classification...\n')

  const started = Date.now()
  const result = await classifyAllUnclassified(1000)
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)

  console.log('\n=== Results ===')
  console.log(`Elapsed: ${elapsedSec}s`)
  console.log(`Success: ${result.success}`)
  console.log(`Failed:  ${result.failed}`)
  console.log(`Themes refreshed: ${result.themes_refreshed}`)
  console.log(`Total cost: $${result.total_cost_usd.toFixed(4)}`)
  console.log('\n=== Distribution ===')
  console.log(`supports:    ${result.distribution.supports}`)
  console.log(`contradicts: ${result.distribution.contradicts}`)
  console.log(`neutral:     ${result.distribution.neutral}`)
  if (result.errors.length > 0) {
    console.log('\n=== First errors ===')
    for (const e of result.errors) console.log(`  ${e.event_id}: ${e.error}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
