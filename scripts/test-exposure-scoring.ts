// Phase 2B sub-task 4 verification.
// 1. Confirm exposure_pct is currently null in DB → fallback path is the live path.
// 2. Run real production functions (getThematicTickers / getPotentialTickers) → no crash.
// 3. Unit-table for exposureWeight mapping (synthetic exposure_pct values).
import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getThematicTickers, getPotentialTickers } from '@/lib/ticker-scoring'

async function main() {
  // Step 1 — exposure_pct coverage in DB
  const { count: total } = await supabaseAdmin
    .from('theme_recommendations')
    .select('id', { count: 'exact', head: true })
  const { count: withExp } = await supabaseAdmin
    .from('theme_recommendations')
    .select('id', { count: 'exact', head: true })
    .not('exposure_pct', 'is', null)
  console.log(`[db] theme_recommendations rows: ${total}`)
  console.log(`[db]   with exposure_pct: ${withExp} (${total ? Math.round((withExp! / total) * 100) : 0}%)`)
  console.log(`[db]   null exposure_pct: ${(total ?? 0) - (withExp ?? 0)} → fallback path is live`)

  // Step 2 — production functions still work
  console.log('\n[run] getThematicTickers("30d", 30)…')
  const them = await getThematicTickers('30d', 30)
  console.log(`[run] returned ${them.length} rows`)
  console.log('  Top 10:')
  for (const t of them.slice(0, 10)) {
    console.log(`    ${t.symbol.padEnd(8)} score=${t.thematic_score}  themes=${t.themes_count}  e7d=${t.recent_events_7d}`)
  }

  console.log('\n[run] getPotentialTickers("all", 30)…')
  const pot = await getPotentialTickers('all', 30)
  console.log(`[run] returned ${pot.length} rows`)
  console.log('  Top 10:')
  for (const t of pot.slice(0, 10)) {
    console.log(`    ${t.symbol.padEnd(8)} score=${t.potential_score}  themes=${t.themes_count}`)
  }

  // Step 3 — exposureWeight unit table
  console.log('\n[unit] exposureWeight(exposure_pct, tier) mapping:')
  console.log('  exposure_pct → weight  (tier-fallback weight in parens)')
  // The helper is module-private; replicate inline so this stays a self-contained check.
  const TIER_WEIGHTS: Record<number, number> = { 1: 3, 2: 1.5 }
  function exposureWeight(exposure_pct: number | null, tier: number): number {
    if (exposure_pct !== null && exposure_pct !== undefined) {
      return Math.max(0, Math.min(100, exposure_pct)) * 0.03
    }
    return TIER_WEIGHTS[tier] ?? 0
  }
  const cases: Array<[number | null, number]> = [
    [95, 1], [80, 1], [70, 1], [60, 2], [50, 2], [35, 2], [20, 3],
    [null, 1], [null, 2], [null, 3],
  ]
  for (const [exp, tier] of cases) {
    const w = exposureWeight(exp, tier)
    const fallback = TIER_WEIGHTS[tier] ?? 0
    const tag = exp === null ? '(fallback)' : `vs T${tier}=${fallback}`
    const delta = exp === null ? '' : `Δ ${(((w - fallback) / (fallback || 1)) * 100).toFixed(0).padStart(4)}%`
    console.log(`  exp=${String(exp ?? 'null').padStart(4)} T${tier} → ${w.toFixed(2).padStart(5)}  ${tag.padEnd(14)} ${delta}`)
  }

  // Step 4 — sanity: synthetic theme with mixed exposure scoring.
  // Five tickers in one theme, simulate one batch with all-null (legacy) vs
  // all-populated (post-Phase-3). Compare aggregate weight.
  console.log('\n[sim] aggregate weight on a synthetic 5-ticker theme:')
  const synth = [
    { tier: 1, exposure_pct: 95 },
    { tier: 1, exposure_pct: 75 },
    { tier: 2, exposure_pct: 60 },
    { tier: 2, exposure_pct: 45 },
    { tier: 2, exposure_pct: 32 },
  ]
  const legacy = synth.reduce((a, r) => a + (TIER_WEIGHTS[r.tier] ?? 0), 0)
  const continuous = synth.reduce((a, r) => a + exposureWeight(r.exposure_pct, r.tier), 0)
  const delta = (((continuous - legacy) / legacy) * 100).toFixed(1)
  console.log(`  legacy (tier-only):       ${legacy.toFixed(2)}`)
  console.log(`  continuous (exposure):    ${continuous.toFixed(2)}`)
  console.log(`  Δ ${delta}% (target: < ±10%)`)
}

main().catch(e => { console.error(e); process.exit(1) })
