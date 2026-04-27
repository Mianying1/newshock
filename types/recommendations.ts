export type ExposureDirection = 'benefits' | 'headwind' | 'mixed' | 'uncertain'
export type MarketCapBand = 'small' | 'mid' | 'large'
export type ExposureType = 'direct' | 'observational' | 'pressure' | 'mixed'
export type ConfidenceBand = 'high' | 'medium' | 'low'

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
  business_exposure: string | null
  business_exposure_zh: string | null
  catalyst: string | null
  catalyst_zh: string | null
  risk: string | null
  risk_zh: string | null
  market_cap_band: MarketCapBand | null
  is_pure_play: boolean | null
  is_often_missed: boolean | null
  confidence: number | null
  exposure_type: ExposureType | null
  confidence_band: ConfidenceBand | null
  is_thematic_tool: boolean | null
  context_label: string | null
  added_at: string
  long_score: number | null
  short_score: number | null
  potential_score: number | null
}

export interface EmergingCandidate {
  id: string
  ticker_symbol: string
  company_name: string | null
  angle_label: string
  gap_reasoning: string | null
  confidence: number | null
  emerging_score: number | null
}

export type EventDirection = 'supports' | 'contradicts' | 'neutral'

export interface CatalystEvent {
  id: string
  headline: string
  short_headline: string | null
  short_headline_zh: string | null
  source_name: string
  source_url: string
  published_at: string
  days_ago: number
  supports_or_contradicts: EventDirection | null
  counter_evidence_reasoning: string | null
  counter_evidence_reasoning_zh: string | null
}

export interface CounterEvidenceSummary {
  supports_count: number
  contradicts_count: number
  neutral_count: number
  last_updated: string
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

export type ThemeTier = 'umbrella' | 'subtheme'

export interface ConvictionBreakdown {
  historical_fit: number
  evidence_strength: number
  priced_in_risk: number
  exit_signal_distance: number
}

export interface ThemeChildRef {
  id: string
  name: string
  name_zh: string | null
  theme_strength_score: number
  event_count: number
}

export interface ThemeParentRef {
  id: string
  name: string
  name_zh: string | null
}

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
  playbook_source: 'theme' | 'archetype'
  playbook_stage: PlaybookStage
  strategist_reflection: string | null
  strategist_reflection_zh: string | null
  deep_generated_at: string | null
  theme_tier: ThemeTier | null
  parent_theme_id: string | null
  parent_theme: ThemeParentRef | null
  child_themes: ThemeChildRef[]
  conviction_score: number | null
  conviction_breakdown: ConvictionBreakdown | null
  conviction_reasoning: string | null
  conviction_reasoning_zh: string | null
  conviction_generated_at: string | null
  counter_evidence_summary: CounterEvidenceSummary | null
  recent_drivers: RecentDriver[] | null
  recent_drivers_generated_at: string | null
  exit_signal_triggers: ExitSignalTrigger[] | null
  typical_duration_days_max: number | null
  emerging_candidates: EmergingCandidate[]
}

export type ExitSignalRuleType = 'event_count' | 'stale' | 'manual_review'
export type ExitSignalStatus = 'not_triggered' | 'triggered' | 'manual_review'

export interface ExitSignalTrigger {
  signal_index: number
  signal_text: string
  trigger_rule_type: ExitSignalRuleType
  trigger_status: ExitSignalStatus
  triggered_at: string | null
  triggered_evidence: {
    reason?: string
    threshold?: number
    window_days?: number
    contradicts_count?: number
    event_count?: number
    examples?: { id: string; event_date: string | null; headline: string }[]
  } | null
  last_checked_at: string
}

export type DriverIcon = 'bolt' | 'building' | 'chip' | 'globe' | 'chart' | 'factory' | 'shield'

export interface RecentDriver {
  icon: DriverIcon
  title: string
  title_zh: string
  description: string
  description_zh: string
  source_label: string
  source_url: string | null
}

export interface ThemeRadarSummary {
  total_active: number
  by_category: Record<string, number>
  by_awareness: Record<string, number>
  most_recent_active: string
  total_recommendations: number
  total_exploratory: number
}
