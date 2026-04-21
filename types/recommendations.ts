export interface ThemeRecommendation {
  ticker_symbol: string
  company_name: string
  sector: string
  market_cap_usd_b: number | null
  tier: 1 | 2 | 3
  role_reasoning: string
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

export interface ThemeRadarItem {
  id: string
  name: string
  category: string
  archetype_id: string | null
  is_exploratory: boolean
  status: string
  institutional_awareness: string
  theme_strength_score: number
  classification_confidence: number
  summary: string
  first_seen_at: string
  last_active_at: string
  days_active: number
  event_count: number
  recommendations: ThemeRecommendation[]
  catalysts: CatalystEvent[]
}

export interface ThemeRadarSummary {
  total_active: number
  by_category: Record<string, number>
  by_awareness: Record<string, number>
  most_recent_active: string
  total_recommendations: number
  total_exploratory: number
}
