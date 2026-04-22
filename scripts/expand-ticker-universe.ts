/**
 * Phase 7 · Ticker universe expansion (stub · not runnable).
 *
 * Usage (once implemented):
 *   npx tsx scripts/expand-ticker-universe.ts [--archetype-id=<uuid>] [--dry-run]
 *
 * Full pipeline:
 *   1. Load active archetypes (filter by --archetype-id or all).
 *   2. For each archetype:
 *        a. AI propose 30-50 candidate tickers (Sonnet).
 *        b. FMP validate: market_cap > $1B · US-listed · non-OTC.
 *        c. Sonnet score (ticker, archetype) → fit_score (0-10) + exposure_label
 *           + evidence_summary(_zh).
 *        d. Auto-approve fit_score >= 8 · queue 5-8 for human review.
 *        e. INSERT ticker_archetype_fit (data_source = 'ai_generated' or
 *           'fmp_validated' after gate).
 *   3. Derive tags → INSERT ticker_tags (sector / industry / supply_chain_position /
 *      commodity_sensitivity etc.).
 *   4. Print cost summary + # candidates / # approved / # rejected.
 *
 * Budget estimate: ~$0.05 / archetype · 40 active archetypes ≈ $2.
 *
 * Review gate: /admin/ticker-graph surfaces pending rows (fit_score 5-8) for
 * approve / reject / edit. theme-generator is later switched to consume only
 * approved rows (drop free-form ticker generation).
 */

async function main(): Promise<void> {
  console.log('[expand-ticker-universe] Phase 7 · not implemented yet.')
  console.log('  See lib/ticker-graph.ts TODO for design.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
