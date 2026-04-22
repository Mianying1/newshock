/**
 * Phase 4 · Conviction Score batch runner (stub).
 *
 * Usage (once implemented):
 *   npx tsx scripts/compute-conviction.ts [--theme-id=<uuid>] [--all]
 *
 * TODO:
 *   1. Load active themes (filter by --theme-id or all active).
 *   2. For each theme: call computeThemeConviction → update themes.conviction_*
 *   3. For each recommendation: call computeRecommendationScore → update theme_recommendations.score_breakdown
 *   4. Print cost summary + # themes scored.
 *
 * Cost budget estimate: Sonnet ~$0.01 / theme · Haiku pre-filter reduces ~60%.
 */

async function main(): Promise<void> {
  console.log('[compute-conviction] Phase 4 · not implemented yet.')
  console.log('  See lib/conviction-score.ts TODOs for design.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
