/* eslint-disable no-console */
/**
 * Dry-run refine for a single theme. Prints before/after. Does NOT write DB.
 *   tsx --env-file=.env.local scripts/test-refine-one.ts
 *   tsx --env-file=.env.local scripts/test-refine-one.ts --theme-id <uuid>
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import { callRefine, loadRefineInput } from '@/lib/refine-recommendations'

async function findTheme(): Promise<string | null> {
  const fromArgs = process.argv.indexOf('--theme-id')
  if (fromArgs >= 0) return process.argv[fromArgs + 1] ?? null
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .ilike('name', '%Iran Crisis%Oil%')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

async function main() {
  const themeId = await findTheme()
  if (!themeId) {
    console.error('Theme not found.')
    process.exit(1)
  }

  const input = await loadRefineInput(themeId)
  if (!input) {
    console.error('No input loaded.')
    process.exit(1)
  }

  console.log('=== Refine · Dry Run ===')
  console.log(`Theme:        ${input.theme.name}`)
  console.log(`Theme id:     ${input.theme.id}`)
  console.log(`Current recs: ${input.current_recs.length}`)
  const thematicToolCount = input.current_recs.filter((r) => r.is_thematic_tool).length
  console.log(`  with is_thematic_tool=true: ${thematicToolCount}`)
  console.log('')
  console.log('[streaming Sonnet, max_tokens=4000]…')

  const started = Date.now()
  const { output, stats } = await callRefine(input)
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[${elapsed}s] done · stop_reason=${stats.stop_reason}`)
  console.log(
    `input=${stats.input_tokens} tok · output=${stats.output_tokens} tok · $${stats.cost_usd.toFixed(4)}`
  )
  console.log('')

  const keptSymbols = new Set(output.refined_recommendations.map((r) => r.ticker_symbol.toUpperCase()))
  const removedSymbols = new Set(output.removed_from_existing.map((r) => r.ticker.toUpperCase()))
  const originalSymbols = new Set(input.current_recs.map((r) => r.ticker_symbol.toUpperCase()))
  const notMentioned = Array.from(originalSymbols).filter(
    (s) => !keptSymbols.has(s) && !removedSymbols.has(s)
  )

  const byType: Record<string, number> = { direct: 0, observational: 0, pressure: 0 }
  for (const r of output.refined_recommendations) {
    byType[r.exposure_type] = (byType[r.exposure_type] ?? 0) + 1
  }
  const byConf: Record<string, number> = { high: 0, medium: 0, low: 0 }
  for (const r of output.refined_recommendations) {
    byConf[r.confidence_band] = (byConf[r.confidence_band] ?? 0) + 1
  }

  console.log('--- SUMMARY ---')
  console.log(output.refinement_summary)
  console.log('')
  console.log(`Kept:         ${output.refined_recommendations.length}`)
  console.log(`  direct:         ${byType.direct}`)
  console.log(`  observational:  ${byType.observational}`)
  console.log(`  pressure:       ${byType.pressure}`)
  console.log(`  conf high/med/low: ${byConf.high}/${byConf.medium}/${byConf.low}`)
  console.log(`Removed:      ${output.removed_from_existing.length}`)
  console.log(`Not mentioned (ambiguous): ${notMentioned.length}`)
  console.log('')

  console.log('--- REMOVED ---')
  for (const r of output.removed_from_existing) {
    console.log(`  ✗ ${r.ticker.padEnd(8)} · ${r.reason}`)
  }
  if (notMentioned.length > 0) {
    console.log('  (not explicitly mentioned):')
    console.log('  ' + notMentioned.join(', '))
  }
  console.log('')

  console.log('--- KEPT (refined) ---')
  for (const r of output.refined_recommendations) {
    const orig = input.current_recs.find(
      (c) => c.ticker_symbol.toUpperCase() === r.ticker_symbol.toUpperCase()
    )
    const isTool = orig?.is_thematic_tool ? ' [tool]' : ''
    console.log(
      `  ${r.exposure_type.toUpperCase().padEnd(14)} ${r.ticker_symbol.padEnd(8)} ${r.confidence_band}${isTool}`
    )
    console.log(`    role:    ${truncate(r.role_reasoning, 150)}`)
    console.log(`    expo:    ${truncate(r.business_exposure, 120)}`)
    if (r.catalyst) console.log(`    catl:    ${truncate(r.catalyst, 100)}`)
    if (r.risk) console.log(`    risk:    ${truncate(r.risk, 100)}`)
    if (r.notes) console.log(`    notes:   ${truncate(r.notes, 120)}`)
  }
  console.log('')

  console.log('--- BEFORE/AFTER LANGUAGE SAMPLES (3 picks) ---')
  const samples = output.refined_recommendations.slice(0, 3)
  for (const r of samples) {
    const orig = input.current_recs.find(
      (c) => c.ticker_symbol.toUpperCase() === r.ticker_symbol.toUpperCase()
    )
    if (!orig) continue
    console.log(`[${r.ticker_symbol}]`)
    console.log(`  BEFORE reasoning: ${truncate(orig.role_reasoning, 150)}`)
    console.log(`  AFTER  reasoning: ${truncate(r.role_reasoning, 150)}`)
    console.log(`  BEFORE catalyst:  ${truncate(orig.catalyst, 100)}`)
    console.log(`  AFTER  catalyst:  ${truncate(r.catalyst, 100)}`)
    console.log('')
  }

  console.log('=== NO DB WRITES (dry run). ===')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
