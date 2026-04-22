/* eslint-disable no-console */
/**
 * Flag tickers that appear in ≥ 3 distinct active themes as "thematic_tool".
 *   tsx --env-file=.env.local scripts/flag-thematic-tools.ts
 */

import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  console.log('=== Flag Thematic Tools (global ≥ 3 themes) ===')

  const { data: recs, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol, theme_id')
  if (error) throw new Error(`fetch: ${error.message}`)

  const byTicker = new Map<string, Set<string>>()
  for (const r of recs ?? []) {
    const set = byTicker.get(r.ticker_symbol) ?? new Set<string>()
    set.add(r.theme_id)
    byTicker.set(r.ticker_symbol, set)
  }

  const flagged = Array.from(byTicker.entries())
    .filter(([, themes]) => themes.size >= 3)
    .map(([ticker, themes]) => ({ ticker, theme_count: themes.size }))
    .sort((a, b) => b.theme_count - a.theme_count)

  console.log(`Total tickers across all recs: ${byTicker.size}`)
  console.log(`Tickers in ≥ 3 themes: ${flagged.length}`)
  console.log('')
  console.log('--- Flagged ---')
  for (const f of flagged) {
    console.log(`  ${f.ticker.padEnd(8)} ${f.theme_count} themes`)
  }

  if (flagged.length === 0) {
    console.log('Nothing to flag.')
    return
  }

  const { error: resetErr } = await supabaseAdmin
    .from('theme_recommendations')
    .update({ is_thematic_tool: false })
    .not('is_thematic_tool', 'is', null)
  if (resetErr) console.log('warn: reset failed:', resetErr.message)

  const symbols = flagged.map((f) => f.ticker)
  const { error: updErr, count } = await supabaseAdmin
    .from('theme_recommendations')
    .update({ is_thematic_tool: true }, { count: 'exact' })
    .in('ticker_symbol', symbols)
  if (updErr) throw new Error(`update: ${updErr.message}`)

  console.log('')
  console.log(`Updated ${count ?? '?'} rec rows with is_thematic_tool=true`)
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
