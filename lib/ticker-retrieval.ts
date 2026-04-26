// Phase 2B.1 · Industry-bucket-based ticker retrieval.
// Given a theme (or archetype), fetch the bucket weights from archetype_bucket_map
// and recall all tickers whose industry_buckets[] overlap. Score by Σ(matched bucket weights)
// blended with a log-scaled market-cap signal.
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface RetrievedTicker {
  ticker: string
  company_name: string
  industry_buckets: string[]
  primary_bucket: string
  market_cap: number
  matched_buckets: string[]
  bucket_weight_sum: number
  retrieval_score: number
  cik?: string | null
}

export interface RetrieveOptions {
  limit?: number
  min_weight?: number
}

export interface BucketWeight { industry_bucket: string; weight: number }

interface TickerRow {
  ticker: string
  company_name: string
  industry_buckets: string[] | null
  primary_bucket: string
  market_cap: number | null
  cik: string | null
}

// log10(1e8)=8 ... log10(3e12)≈12.5 — clamp to [0,1]
function marketCapScore(mc: number | null): number {
  if (!mc || mc <= 0) return 0
  const log = Math.log10(mc)
  const norm = (log - 8) / (12.5 - 8)
  return Math.max(0, Math.min(1, norm))
}

export async function fetchArchetypeBuckets(archetypeId: string, minWeight: number): Promise<BucketWeight[]> {
  const { data, error } = await supabaseAdmin
    .from('archetype_bucket_map')
    .select('industry_bucket, weight')
    .eq('archetype_name', archetypeId)
    .gte('weight', minWeight)
  if (error) throw new Error(`fetchArchetypeBuckets: ${error.message}`)
  return (data ?? []) as BucketWeight[]
}

async function fetchTickersOverlapping(buckets: string[]): Promise<TickerRow[]> {
  if (buckets.length === 0) return []
  // Page through in case overlap returns >1k rows.
  const all: TickerRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('ticker_industry_map')
      .select('ticker, company_name, industry_buckets, primary_bucket, market_cap, cik')
      .overlaps('industry_buckets', buckets)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetchTickersOverlapping: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as TickerRow[]))
    if (data.length < PAGE) break
  }
  return all
}

export async function retrieveTickersByArchetype(
  archetypeId: string,
  options: RetrieveOptions = {},
): Promise<RetrievedTicker[]> {
  const limit = options.limit ?? 100
  const minWeight = options.min_weight ?? 0.4

  const archetypeBuckets = await fetchArchetypeBuckets(archetypeId, minWeight)
  if (archetypeBuckets.length === 0) return []
  const weightById = new Map(archetypeBuckets.map(b => [b.industry_bucket, b.weight]))
  const bucketIds = [...weightById.keys()]

  const tickerRows = await fetchTickersOverlapping(bucketIds)

  const scored: RetrievedTicker[] = tickerRows.map(t => {
    const buckets = t.industry_buckets ?? []
    const matched = buckets.filter(b => weightById.has(b))
    const weightSum = matched.reduce((acc, b) => acc + (weightById.get(b) ?? 0), 0)
    const mcScore = marketCapScore(t.market_cap)
    // bucket_weight_sum can theoretically exceed 1 (multiple buckets matched).
    // Normalize to [0,1] by capping at the sum of the top-N archetype weights.
    const maxPossible = archetypeBuckets
      .map(b => b.weight)
      .sort((a, b) => b - a)
      .slice(0, Math.max(1, matched.length))
      .reduce((a, b) => a + b, 0)
    const weightNorm = maxPossible > 0 ? Math.min(1, weightSum / maxPossible) : 0
    // 70:30 weight:mcap — let bucket-match purity dominate; mcap is a tie-breaker
    // so mega-caps with weak single-bucket matches (AAPL→AI, NVDA→Defense) don't
    // crowd out true pure plays (LMT, COIN).
    const retrieval_score = Math.round(weightNorm * 70 + mcScore * 30)
    return {
      ticker: t.ticker,
      company_name: t.company_name,
      industry_buckets: buckets,
      primary_bucket: t.primary_bucket,
      market_cap: t.market_cap ?? 0,
      matched_buckets: matched,
      bucket_weight_sum: Number(weightSum.toFixed(3)),
      retrieval_score,
      cik: t.cik,
    }
  })

  // Sort by retrieval_score (blends bucket purity + market cap) so mega-caps with
  // single-bucket matches (e.g. MSFT/cloud, VST/power) aren't crowded out by mid-caps
  // matching multiple buckets.
  scored.sort((a, b) => {
    if (b.retrieval_score !== a.retrieval_score) return b.retrieval_score - a.retrieval_score
    if (b.bucket_weight_sum !== a.bucket_weight_sum) return b.bucket_weight_sum - a.bucket_weight_sum
    return (b.market_cap ?? 0) - (a.market_cap ?? 0)
  })
  return scored.slice(0, limit)
}

export async function retrieveTickersByTheme(
  themeId: string,
  options: RetrieveOptions = {},
): Promise<RetrievedTicker[]> {
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('archetype_id')
    .eq('id', themeId)
    .maybeSingle()
  if (error) throw new Error(`theme lookup: ${error.message}`)
  if (!data?.archetype_id) return []
  return retrieveTickersByArchetype(data.archetype_id as string, options)
}
