import type { ThemeRecommendation } from '@/types/recommendations'

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1 · 核心受益',
  2: 'Tier 2 · 二阶受益',
  3: 'Tier 3 · 边缘信号',
}

export default function RecommendationTier({
  tier,
  recommendations,
}: {
  tier: 1 | 2 | 3
  recommendations: ThemeRecommendation[]
}) {
  if (recommendations.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-zinc-700 mb-2">{TIER_LABELS[tier]}</p>
      <div className="space-y-2">
        {recommendations.map((r) => (
          <div key={r.ticker_symbol}>
            <span className="font-mono font-semibold text-zinc-900">${r.ticker_symbol}</span>
            {r.company_name && r.company_name !== r.ticker_symbol && (
              <span className="text-zinc-700 ml-2">{r.company_name}</span>
            )}
            {r.role_reasoning && (
              <p className="text-sm text-zinc-500 mt-0.5">{r.role_reasoning}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
