export type ExposureDirection = 'benefits' | 'headwind' | 'mixed' | 'uncertain'

export interface ThemeRecommendation {
  ticker_symbol: string
  company_name: string
  sector: string
  market_cap_usd_b: number | null
  logo_url: string | null
  tier: 1 | 2 | 3
  exposure_direction: ExposureDirection
  role_reasoning: string
  role_reasoning_zh: string | null
  added_at: string
}

export interface CatalystEvent {
  id: string
  headline: string
  source_name: string
  source_url: string
  published_at: string
  days_ago: number
}

export interface PlaybookHistoricalCase {
  name: string
  approximate_duration: string
  peak_move: string
  exit_trigger: string
  confidence: 'high' | 'medium'
}

export interface PlaybookDifference {
  dimension: 'demand_side' | 'supply_side' | 'macro' | 'policy' | 'technology'
  description: string
  direction: 'may_extend' | 'may_shorten' | 'uncertain'
  confidence: 'high' | 'medium'
}

export interface PlaybookSimilarity {
  dimension: string
  description: string
}

export type DurationType = 'bounded' | 'extended' | 'dependent'

export interface RealWorldTimeline {
  approximate_start: string
  description: string
  current_maturity_estimate: 'early' | 'mid' | 'late' | 'beyond_typical'
}

export interface ArchetypePlaybook {
  typical_duration_label: string
  typical_duration_days_approx: [number, number]
  historical_cases: PlaybookHistoricalCase[]
  this_time_different: {
    differences: PlaybookDifference[]
    similarities: PlaybookSimilarity[]
    observation: string
  }
  exit_signals: string[]
  duration_type?: DurationType
  duration_type_reasoning?: string
  real_world_timeline?: RealWorldTimeline
}

export type PlaybookStage = 'early' | 'mid' | 'late' | 'beyond' | 'unknown'

export interface ThemeRadarItem {
  id: string
  name: string
  name_zh: string | null
  category: string
  archetype_id: string | null
  is_exploratory: boolean
  status: string
  institutional_awareness: string
  theme_strength_score: number
  classification_confidence: number
  summary: string
  summary_zh: string | null
  first_seen_at: string
  last_active_at: string
  days_active: number
  days_hot: number
  days_since_last_event: number
  event_count: number
  earliest_event_date: string
  latest_event_date: string
  recommendations: ThemeRecommendation[]
  catalysts: CatalystEvent[]
  archetype_playbook: ArchetypePlaybook | null
  archetype_playbook_zh: ArchetypePlaybook | null
  playbook_stage: PlaybookStage
}

export interface ThemeRadarSummary {
  total_active: number
  by_category: Record<string, number>
  by_awareness: Record<string, number>
  most_recent_active: string
  total_recommendations: number
  total_exploratory: number
}
