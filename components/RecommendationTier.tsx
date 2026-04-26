'use client'
import Link from 'next/link'
import type { ThemeRecommendation, ExposureDirection } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { TickerBadge } from '@/components/TickerBadge'

const DIRECTION_CONFIG: Record<ExposureDirection, { icon: string; color: string; labelKey: string }> = {
  benefits:  { icon: '▲', color: 'text-emerald-600', labelKey: 'theme_detail.direction_benefits' },
  headwind:  { icon: '▼', color: 'text-rose-600',    labelKey: 'theme_detail.direction_headwind' },
  mixed:     { icon: '◆', color: 'text-amber-600',   labelKey: 'theme_detail.direction_mixed' },
  uncertain: { icon: '○', color: 'text-zinc-400',    labelKey: 'theme_detail.direction_uncertain' },
}

export default function RecommendationTier({
  tier,
  recommendations,
}: {
  tier: 1 | 2 | 3
  recommendations: ThemeRecommendation[]
}) {
  const { t, locale } = useI18n()

  const tierKeys: Record<number, string> = {
    1: 'theme_detail.tier1',
    2: 'theme_detail.tier2',
    3: 'theme_detail.tier3',
  }

  if (recommendations.length === 0) return null

  return (
    <div className="mb-5">
      <p className="text-sm font-semibold text-zinc-700 mb-2">
        Tier {tier} · {t(tierKeys[tier])}
      </p>
      <div className="space-y-3">
        {recommendations.map((r) => {
          const dir = DIRECTION_CONFIG[r.exposure_direction] ?? DIRECTION_CONFIG.uncertain
          const showDirection = r.exposure_direction !== 'uncertain'
          const reasoning = pickField(locale, r.role_reasoning, r.role_reasoning_zh)
          return (
            <div key={r.ticker_symbol}>
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/tickers/${r.ticker_symbol}`} className="hover:opacity-80 transition">
                  <TickerBadge
                    symbol={r.ticker_symbol}
                    name={r.company_name}
                    logoUrl={r.logo_url}
                    size="md"
                    showName
                  />
                </Link>
                {showDirection && (
                  <span className={`text-xs font-medium ${dir.color}`}>
                    {dir.icon} {t(dir.labelKey)}
                  </span>
                )}
              </div>
              {reasoning.trim().length > 0 ? (
                <p className="text-sm text-zinc-500 mt-0.5 ml-9">{reasoning}</p>
              ) : (
                <p className="text-xs text-zinc-400 mt-0.5 ml-9">{t('theme_detail.exposure_fallback')}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
