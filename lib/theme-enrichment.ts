import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  callRefine,
  loadRefineInput,
  applyRefinement,
  type RefineStats,
  type RefinedRec,
} from '@/lib/refine-recommendations'

export interface EnrichResult {
  ok: boolean
  theme_id: string
  updated: number
  removed: number
  kept_tickers: string[]
  removed_tickers: string[]
  error?: string
  stats?: RefineStats
}

function exposureTypeToDirection(
  exposure_type: RefinedRec['exposure_type']
): 'benefits' | 'headwind' | 'mixed' | 'uncertain' {
  if (exposure_type === 'pressure') return 'headwind'
  if (exposure_type === 'direct' || exposure_type === 'observational') return 'benefits'
  return 'uncertain'
}

export async function enrichThemeRecommendations(themeId: string): Promise<EnrichResult> {
  const input = await loadRefineInput(themeId)
  if (!input) {
    return {
      ok: false,
      theme_id: themeId,
      updated: 0,
      removed: 0,
      kept_tickers: [],
      removed_tickers: [],
      error: 'theme not found',
    }
  }

  if (input.current_recs.length === 0) {
    return {
      ok: true,
      theme_id: themeId,
      updated: 0,
      removed: 0,
      kept_tickers: [],
      removed_tickers: [],
    }
  }

  let output: Awaited<ReturnType<typeof callRefine>>
  try {
    output = await callRefine(input)
  } catch (e) {
    return {
      ok: false,
      theme_id: themeId,
      updated: 0,
      removed: 0,
      kept_tickers: [],
      removed_tickers: [],
      error: `refine call: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (output.output.refined_recommendations.length === 0) {
    return {
      ok: false,
      theme_id: themeId,
      updated: 0,
      removed: 0,
      kept_tickers: [],
      removed_tickers: [],
      error: 'Sonnet returned 0 refined recommendations',
      stats: output.stats,
    }
  }

  let apply: Awaited<ReturnType<typeof applyRefinement>>
  try {
    apply = await applyRefinement(themeId, input, output.output)
  } catch (e) {
    return {
      ok: false,
      theme_id: themeId,
      updated: 0,
      removed: 0,
      kept_tickers: [],
      removed_tickers: [],
      error: `apply: ${e instanceof Error ? e.message : String(e)}`,
      stats: output.stats,
    }
  }

  // exposure_direction is not set by refine — derive from exposure_type.
  for (const r of output.output.refined_recommendations) {
    const direction = exposureTypeToDirection(r.exposure_type)
    await supabaseAdmin
      .from('theme_recommendations')
      .update({ exposure_direction: direction })
      .eq('theme_id', themeId)
      .eq('ticker_symbol', r.ticker_symbol.toUpperCase())
  }

  const keptTickers = output.output.refined_recommendations.map((r) =>
    r.ticker_symbol.toUpperCase()
  )
  const originalSet = new Set(input.current_recs.map((r) => r.ticker_symbol.toUpperCase()))
  const removedTickers = Array.from(originalSet).filter((s) => !keptTickers.includes(s))

  return {
    ok: true,
    theme_id: themeId,
    updated: apply.updated,
    removed: apply.explicit_removed + apply.implicit_removed,
    kept_tickers: keptTickers,
    removed_tickers: removedTickers,
    stats: output.stats,
  }
}
