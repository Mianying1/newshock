import { supabaseAdmin } from './supabase-admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  base_tier: number
  confidence_bonus: number
  historical_alpha_bonus: number
  historical_data: { sample_size: number; avg_t5_alpha: number } | null
  mention_bonus: number
  final_score: number
}

export interface ScoreResult {
  event_id: string
  scored_count: number
}

export interface ScoreSummary {
  events_processed: number
  total_scores_created: number
  avg_score: number
  max_score: number
  duration_ms: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseScore(tier: number): number {
  if (tier === 1) return 70
  if (tier === 2) return 55
  return 40
}

function confidenceBonus(confidence: number | null): number {
  if (confidence === null) return 0
  if (confidence >= 0.9) return 10
  if (confidence >= 0.8) return 7
  if (confidence >= 0.7) return 4
  return 0
}

function historicalBonus(avgT5: number): number {
  if (avgT5 >= 0.10) return 15
  if (avgT5 >= 0.05) return 10
  if (avgT5 >= 0.03) return 5
  if (avgT5 >= 0.00) return 2
  return -5
}

// Extract t5 values from tier_1_reactions and tier_2_reactions for a given ticker
function extractT5(
  instances: Array<{ tier_1_reactions: Record<string, { t5?: number }> | null; tier_2_reactions: Record<string, { t5?: number }> | null }>,
  ticker: string
): number[] {
  const values: number[] = []
  for (const inst of instances) {
    const t1 = (inst.tier_1_reactions ?? {}) as Record<string, { t5?: number }>
    const t2 = (inst.tier_2_reactions ?? {}) as Record<string, { t5?: number }>
    const entry = t1[ticker] ?? t2[ticker]
    if (entry?.t5 !== undefined) values.push(entry.t5)
  }
  return values
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// ─── Core scoring ─────────────────────────────────────────────────────────────

export async function scoreEvent(eventId: string): Promise<ScoreResult> {
  // 1. Load event
  const { data: event, error: evErr } = await supabaseAdmin
    .from('events')
    .select('id, pattern_id, classification_confidence, mentioned_tickers, novel_tickers')
    .eq('id', eventId)
    .single()

  if (evErr || !event?.pattern_id) {
    console.warn(`[scorer] Skipping ${eventId}: no pattern or error`)
    return { event_id: eventId, scored_count: 0 }
  }

  // 2. Load pattern_ticker_map (skip __SELF__ placeholders, skip non-recommendation tickers)
  const { data: mappings } = await supabaseAdmin
    .from('pattern_ticker_map')
    .select('ticker_symbol, tier')
    .eq('pattern_id', event.pattern_id)
    .neq('ticker_symbol', '__SELF__')

  if (!mappings || mappings.length === 0) return { event_id: eventId, scored_count: 0 }

  // 3. Filter to is_recommendation_candidate tickers only
  const symbols = mappings.map((m) => m.ticker_symbol)
  const { data: tickerRows } = await supabaseAdmin
    .from('tickers')
    .select('symbol, is_recommendation_candidate')
    .in('symbol', symbols)

  const candidateSet = new Set(
    (tickerRows ?? [])
      .filter((t) => t.is_recommendation_candidate !== false)
      .map((t) => t.symbol)
  )

  const candidateMappings = mappings.filter((m) => candidateSet.has(m.ticker_symbol))
  if (candidateMappings.length === 0) return { event_id: eventId, scored_count: 0 }

  // 4. Load historical instances for this pattern
  const { data: historical } = await supabaseAdmin
    .from('historical_instances')
    .select('tier_1_reactions, tier_2_reactions')
    .eq('pattern_id', event.pattern_id)

  // 5. Mentioned tickers set
  const mentionedSet = new Set([
    ...(event.mentioned_tickers ?? []),
    ...(event.novel_tickers ?? []),
  ])

  // 6. Score each ticker
  const confidence = event.classification_confidence as number | null
  const confBonus = confidenceBonus(confidence)
  const run_id = new Date().toISOString().slice(0, 16) // minute-level run_id

  const scoreRows = candidateMappings.map((mapping) => {
    const base = baseScore(mapping.tier)

    // Historical alpha
    const t5Values = extractT5(historical ?? [], mapping.ticker_symbol)
    const hasHistorical = t5Values.length > 0
    const avgT5 = hasHistorical ? avg(t5Values) : 0
    const histBonus = hasHistorical ? historicalBonus(avgT5) : 0

    // Mention bonus
    const mentionBonus = mentionedSet.has(mapping.ticker_symbol) ? 5 : 0

    const raw = base + confBonus + histBonus + mentionBonus
    const final_score = Math.max(0, Math.min(100, raw))

    const breakdown: ScoreBreakdown = {
      base_tier: base,
      confidence_bonus: confBonus,
      historical_alpha_bonus: histBonus,
      historical_data: hasHistorical
        ? { sample_size: t5Values.length, avg_t5_alpha: Math.round(avgT5 * 1000) / 1000 }
        : null,
      mention_bonus: mentionBonus,
      final_score,
    }

    return {
      event_id: eventId,
      ticker_symbol: mapping.ticker_symbol,
      tier: mapping.tier,
      score: final_score,
      score_breakdown: breakdown,
      run_id,
    }
  })

  // 7. Upsert (unique on event_id, ticker_symbol, run_id)
  const { error: upsertErr } = await supabaseAdmin
    .from('event_scores')
    .upsert(scoreRows, { onConflict: 'event_id,ticker_symbol,run_id' })

  if (upsertErr) {
    console.warn(`[scorer] Upsert failed for event ${eventId}: ${upsertErr.message}`)
    return { event_id: eventId, scored_count: 0 }
  }

  console.log(`[scorer] ${eventId.slice(0, 8)} → ${scoreRows.length} scores (pattern: ${event.pattern_id})`)
  return { event_id: eventId, scored_count: scoreRows.length }
}

export async function scorePendingEvents(options: {
  limit?: number
  run_id?: string
} = {}): Promise<ScoreSummary> {
  const { limit = 50 } = options
  const start = Date.now()

  // Find classified events not yet scored
  const { data: scoredEventIds } = await supabaseAdmin
    .from('event_scores')
    .select('event_id')

  const alreadyScored = new Set((scoredEventIds ?? []).map((r: { event_id: string }) => r.event_id))

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id')
    .not('pattern_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit * 3) // fetch extra, filter in memory

  const pending = (events ?? [])
    .filter((e) => !alreadyScored.has(e.id))
    .slice(0, limit)

  if (pending.length === 0) {
    console.log('[scorer] No pending events to score')
    return { events_processed: 0, total_scores_created: 0, avg_score: 0, max_score: 0, duration_ms: 0 }
  }

  console.log(`[scorer] Scoring ${pending.length} events`)

  let totalScores = 0
  const results = await Promise.all(pending.map((e) => scoreEvent(e.id)))
  for (const r of results) totalScores += r.scored_count

  // Compute stats from DB
  const { data: allScores } = await supabaseAdmin
    .from('event_scores')
    .select('score')
    .in('event_id', pending.map((e) => e.id))

  const scores = (allScores ?? []).map((r: { score: number }) => r.score)
  const avgScore = scores.length > 0 ? Math.round(avg(scores)) : 0
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0

  return {
    events_processed: pending.length,
    total_scores_created: totalScores,
    avg_score: avgScore,
    max_score: maxScore,
    duration_ms: Date.now() - start,
  }
}
