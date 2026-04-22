import { supabaseAdmin } from './supabase-admin'

export type ExposureLabel = 'direct' | 'secondary' | 'peripheral' | 'pressure' | 'uncertain'
export type FitDataSource = 'ai_generated' | 'manual' | 'fmp_validated'
export type TagType =
  | 'sector'
  | 'industry'
  | 'supply_chain_position'
  | 'geography'
  | 'customer_base'
  | 'rate_sensitivity'
  | 'commodity_sensitivity'
  | 'policy_sensitivity'
export type TagSource = 'ai_derived' | 'manual' | 'fmp_data'

export interface TickerCandidate {
  ticker_symbol: string
  fit_score: number
  exposure_label: ExposureLabel | null
  relationship_type: string | null
  evidence_summary: string | null
  evidence_summary_zh: string | null
  last_validated_at: string | null
}

export interface TickerFit {
  ticker_symbol: string
  archetype_id: string
  fit_score: number
  exposure_label: ExposureLabel | null
  relationship_type: string | null
  evidence_summary: string | null
  evidence_summary_zh: string | null
  data_source: FitDataSource
  last_validated_at: string | null
}

export interface TickerTag {
  id: string
  ticker_symbol: string
  tag_type: TagType
  tag_value: string
  confidence: number | null
  source: TagSource
}

const MIN_FIT_SCORE = 5.0

export async function getCandidatesForArchetype(
  archetypeId: string,
  limit = 30,
  minFitScore = MIN_FIT_SCORE
): Promise<TickerCandidate[]> {
  const { data, error } = await supabaseAdmin
    .from('ticker_archetype_fit')
    .select('ticker_symbol, fit_score, exposure_label, relationship_type, evidence_summary, evidence_summary_zh, last_validated_at')
    .eq('archetype_id', archetypeId)
    .gte('fit_score', minFitScore)
    .order('fit_score', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[ticker-graph] getCandidatesForArchetype error:', error.message)
    return []
  }
  return (data ?? []) as TickerCandidate[]
}

export async function getTickerFitProfile(tickerSymbol: string): Promise<TickerFit[]> {
  const { data, error } = await supabaseAdmin
    .from('ticker_archetype_fit')
    .select('*')
    .eq('ticker_symbol', tickerSymbol)
    .order('fit_score', { ascending: false })
  if (error) {
    console.error('[ticker-graph] getTickerFitProfile error:', error.message)
    return []
  }
  return (data ?? []) as TickerFit[]
}

export async function getTickerTags(tickerSymbol: string): Promise<TickerTag[]> {
  const { data, error } = await supabaseAdmin
    .from('ticker_tags')
    .select('*')
    .eq('ticker_symbol', tickerSymbol)
  if (error) {
    console.error('[ticker-graph] getTickerTags error:', error.message)
    return []
  }
  return (data ?? []) as TickerTag[]
}

// TODO Phase 7 full pipeline:
//   - scripts/expand-ticker-universe.ts 对每 active archetype:
//       1. AI 提 30-50 candidates.
//       2. FMP 验证 market cap > $1B · 去 OTC / 低流动性.
//       3. Sonnet 对每 (ticker, archetype) 打 fit_score + exposure_label.
//       4. Human review 前 10 · approve gate 才写库.
//       5. INSERT ticker_archetype_fit.
//   - Admin review UI /admin/ticker-graph (approve / reject / edit evidence).
//   - lib/theme-generator.ts 改: 不再自由生 ticker · 仅从 ticker_archetype_fit
//     按 archetype_id 取候选 (保留 Sonnet tier 分配 + reasoning).
