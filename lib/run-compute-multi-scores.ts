import pLimit from 'p-limit'
import { supabaseAdmin } from './supabase-admin'
import { buildScoreContext, computeTickerScores } from './compute-ticker-multi-scores'

export interface RunComputeMultiScoresResult {
  mode: 'incremental' | 'full'
  tickers_in_scope: number
  tickers_written: number
  tickers_failed: number
  rows_updated: number
  null_rows_before: number
  null_rows_after: number
  elapsed_ms: number
}

export async function runComputeMultiScores(
  mode: 'incremental' | 'full' = 'incremental',
): Promise<RunComputeMultiScoresResult> {
  const t0 = Date.now()

  const { count: nullBefore } = await supabaseAdmin
    .from('theme_recommendations')
    .select('*', { count: 'exact', head: true })
    .is('long_score', null)

  let scopeTickers: Set<string> | null = null
  if (mode === 'incremental') {
    const tickers = new Set<string>()
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from('theme_recommendations')
        .select('ticker_symbol')
        .is('long_score', null)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`scope query: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) tickers.add((r as { ticker_symbol: string }).ticker_symbol)
      if (data.length < PAGE) break
      from += PAGE
    }
    scopeTickers = tickers
    if (tickers.size === 0) {
      return {
        mode,
        tickers_in_scope: 0,
        tickers_written: 0,
        tickers_failed: 0,
        rows_updated: 0,
        null_rows_before: nullBefore ?? 0,
        null_rows_after: nullBefore ?? 0,
        elapsed_ms: Date.now() - t0,
      }
    }
  }

  const ctx = await buildScoreContext()
  const allMapped = [...ctx.byTicker.keys()]
  const tickers = scopeTickers ? allMapped.filter((s) => scopeTickers!.has(s)) : allMapped

  const nowIso = new Date().toISOString()
  const limit = pLimit(8)
  let writtenTickers = 0
  let writeErr = 0
  let totalRows = 0

  await Promise.all(
    tickers.map((sym) =>
      limit(async () => {
        const s = computeTickerScores(sym, ctx)
        const { data, error } = await supabaseAdmin
          .from('theme_recommendations')
          .update({
            short_score: s.short.value,
            long_score: s.long.value,
            potential_score: s.potential.value,
            scores_computed_at: nowIso,
          })
          .eq('ticker_symbol', sym)
          .select('id')
        if (error) {
          writeErr++
          return
        }
        writtenTickers++
        totalRows += data?.length ?? 0
      }),
    ),
  )

  const { count: nullAfter } = await supabaseAdmin
    .from('theme_recommendations')
    .select('*', { count: 'exact', head: true })
    .is('long_score', null)

  return {
    mode,
    tickers_in_scope: tickers.length,
    tickers_written: writtenTickers,
    tickers_failed: writeErr,
    rows_updated: totalRows,
    null_rows_before: nullBefore ?? 0,
    null_rows_after: nullAfter ?? 0,
    elapsed_ms: Date.now() - t0,
  }
}
