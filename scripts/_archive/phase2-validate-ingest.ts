/**
 * scripts/phase2-validate-ingest.ts
 *
 * Local-driver equivalent of `/api/cron/ingest?slot=us_close`.
 * Runs the Phase-2 pipeline against prod Supabase + live Anthropic.
 *
 * dotenv must load BEFORE any module imports supabase-admin / anthropic,
 * so pipeline modules are dynamically imported after config().
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

async function main(): Promise<void> {
  const { runIngest } = await import('../lib/ingest')
  const { generateThemesForPendingEvents } = await import('../lib/theme-generator')

  const slot = (process.argv[2] ?? 'us_close') as 'asia_eu' | 'eu_us_mid' | 'us_close'
  const startedAt = Date.now()
  console.log(`[phase2-validate] slot=${slot} started_at=${new Date(startedAt).toISOString()}`)

  console.log(`[phase2-validate] Step 1: runIngest`)
  const ingest = await runIngest({ slot, per_source_limit: 30 })
  console.log(`[phase2-validate] ingest result:`, JSON.stringify({
    total_fetched: ingest.total_fetched,
    new_inserted: ingest.new_inserted,
    skipped_duplicates: ingest.skipped_duplicates,
    duration_ms: ingest.duration_ms,
    sources: ingest.sources.map((s) => ({ id: s.id, fetched: s.fetched, errors: s.errors.length })),
  }, null, 2))

  console.log(`[phase2-validate] Step 2: generateThemesForPendingEvents(limit=150, rate_limit=5)`)
  const theme = await generateThemesForPendingEvents({ limit: 150, rate_limit: 5 })

  console.log(`[phase2-validate] theme result:`, JSON.stringify({
    processed: theme.processed,
    strengthen_existing: theme.strengthen_existing,
    new_from_archetype: theme.new_from_archetype,
    new_exploratory: theme.new_exploratory,
    irrelevant: theme.irrelevant,
    deferred_sec: theme.deferred_sec,
    errors: theme.errors,
    themes_created: theme.themes_created,
    recommendations_created: theme.recommendations_created,
    active_themes_after: theme.active_themes_after,
    cost_estimate_usd: theme.cost_estimate_usd,
    duration_ms: theme.duration_ms,
    exploratory_details: theme.exploratory_details,
  }, null, 2))

  console.log(`[phase2-validate] DONE total_duration_ms=${Date.now() - startedAt}`)
}

main().catch((err) => {
  console.error('[phase2-validate] FATAL:', err)
  process.exit(1)
})
