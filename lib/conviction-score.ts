import type { SupabaseClient } from '@supabase/supabase-js'

export interface ConvictionBreakdown {
  historical_fit: number
  evidence_strength: number
  priced_in_risk: number
  exit_signal_distance: number
}

export interface ScoreBreakdown {
  directness: number
  purity: number
  sensitivity: number
  crowding_penalty: number
  mega_cap_penalty: number
}

export interface ConvictionResult {
  score: number
  breakdown: ConvictionBreakdown
  reasoning: string
  reasoning_zh: string
  cost_usd: number
}

// TODO Phase 4 · Conviction Score
// 实现时调用 Sonnet 对 theme 评 4 维度:
//   historical_fit         (历史模式契合度)
//   evidence_strength      (证据强度)
//   priced_in_risk         (是否已被定价 · 反向评分)
//   exit_signal_distance   (距离冷却/退出信号的距离)
// 可用 Haiku 做预筛选 (剔除明显低分 theme) · 仅对高分 theme 调 Sonnet 写 reasoning.
export async function computeThemeConviction(
  _supabase: SupabaseClient,
  _themeId: string
): Promise<ConvictionResult> {
  throw new Error('Phase 4 · computeThemeConviction not implemented yet')
}

// TODO Phase 4 · Per-recommendation score_breakdown
// 计算每个 theme_recommendation 的 5 维度分数:
//   directness       (直接受益度)
//   purity           (业务纯度 · 主营占比)
//   sensitivity      (业绩/股价对主题的弹性)
//   crowding_penalty (同一 ticker 出现在 >N 主题 · 扣分)
//   mega_cap_penalty (市值过大 · 稀释效应 · 扣分)
export async function computeRecommendationScore(
  _supabase: SupabaseClient,
  _recommendationId: string
): Promise<ScoreBreakdown> {
  throw new Error('Phase 4 · computeRecommendationScore not implemented yet')
}
