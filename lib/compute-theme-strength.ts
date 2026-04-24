export interface ThemeEvent {
  event_date: string | null
  level_of_impact: string | null
  source_name: string | null
}

export interface StrengthBreakdown {
  strength: number
  raw_weight: number
  unique_sources: number
  diversity_mult: number
  event_count: number
}

export const STRENGTH_CONFIG = {
  BASELINE: 15,
  SOURCE_DECAY_RATIO: 0.78,
  RECENCY_HALF_LIFE_DAYS: 45,
  K_MULTIPLIER: 2.1,
  // DB stores level_of_impact as 'structure' | 'subtheme' | 'event_only'.
  // Aliases to spec's high/medium/low also accepted.
  IMPACT_WEIGHTS: {
    structure: 1.5,
    subtheme: 1.0,
    event_only: 0.5,
    high: 1.5,
    medium: 1.0,
    low: 0.5,
  } as Record<string, number>,
} as const

export function computeThemeStrength(events: ThemeEvent[]): StrengthBreakdown {
  const valid = events.filter((e) => e.event_date)

  if (valid.length === 0) {
    return {
      strength: STRENGTH_CONFIG.BASELINE,
      raw_weight: 0,
      unique_sources: 0,
      diversity_mult: 1,
      event_count: 0,
    }
  }

  const sorted = [...valid].sort(
    (a, b) => new Date(b.event_date!).getTime() - new Date(a.event_date!).getTime()
  )

  const sourceRankCount = new Map<string, number>()
  let rawWeight = 0

  for (const event of sorted) {
    const src = event.source_name ?? 'unknown'
    const rank = sourceRankCount.get(src) ?? 0

    const daysAgo = Math.max(0, (Date.now() - new Date(event.event_date!).getTime()) / 86400000)
    const recency = Math.exp(-daysAgo / STRENGTH_CONFIG.RECENCY_HALF_LIFE_DAYS)
    const sourceDecay = Math.pow(STRENGTH_CONFIG.SOURCE_DECAY_RATIO, rank)
    const impact = STRENGTH_CONFIG.IMPACT_WEIGHTS[event.level_of_impact ?? 'subtheme'] ?? 1.0

    rawWeight += recency * sourceDecay * impact
    sourceRankCount.set(src, rank + 1)
  }

  const uniqueSources = sourceRankCount.size
  const diversityMult = Math.log2(1 + uniqueSources)
  const strength = Math.min(
    100,
    STRENGTH_CONFIG.BASELINE + STRENGTH_CONFIG.K_MULTIPLIER * rawWeight * diversityMult
  )

  return {
    strength: Math.round(strength),
    raw_weight: Math.round(rawWeight * 100) / 100,
    unique_sources: uniqueSources,
    diversity_mult: Math.round(diversityMult * 100) / 100,
    event_count: valid.length,
  }
}
