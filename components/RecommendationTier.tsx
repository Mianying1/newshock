'use client'
import type { ThemeRecommendation } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { TickerBadge } from '@/components/TickerBadge'

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
      <div className="space-y-3">
        {recommendations.map((r) => (
          <div key={r.ticker_symbol}>
            <TickerBadge
              symbol={r.ticker_symbol}
              name={r.company_name}
              logoUrl={r.logo_url}
              size="md"
              showName
            />
            {r.role_reasoning && r.role_reasoning.trim().length > 0 ? (
              <p className="text-sm text-zinc-500 mt-0.5 ml-9">{r.role_reasoning}</p>
            ) : (
              <p className="text-xs text-zinc-400 italic mt-0.5 ml-9">{t('theme_detail.exposure_fallback')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
