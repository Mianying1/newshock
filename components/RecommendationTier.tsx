'use client'
import type { ThemeRecommendation } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'

export default function RecommendationTier({
  tier,
  recommendations,
}: {
  tier: 1 | 2 | 3
  recommendations: ThemeRecommendation[]
}) {
  const { t } = useI18n()

  const tierKeys: Record<number, string> = {
    1: 'theme_detail.tier1',
    2: 'theme_detail.tier2',
    3: 'theme_detail.tier3',
  }

  if (recommendations.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-zinc-700 mb-2">
        Tier {tier} · {t(tierKeys[tier])}
      </p>
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
