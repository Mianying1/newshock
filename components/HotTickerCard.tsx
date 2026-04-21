'use client'
import Link from 'next/link'
import { TickerBadge } from '@/components/TickerBadge'
import { useI18n } from '@/lib/i18n-context'

interface ThemeRef {
  id: string
  name: string
  tier: number
  role_reasoning: string
  theme_strength: number
}

interface HotTicker {
  ticker_symbol: string
  company_name: string
  sector: string | null
  logo_url?: string | null
  themes: ThemeRef[]
  tier_distribution: Record<number, number>
}

export default function HotTickerCard({ ticker }: { ticker: HotTicker }) {
  const { t } = useI18n()
  const tierSummaryParts: string[] = []
  if (ticker.tier_distribution[1] > 0) tierSummaryParts.push(`Tier 1 × ${ticker.tier_distribution[1]}`)
  if (ticker.tier_distribution[2] > 0) tierSummaryParts.push(`Tier 2 × ${ticker.tier_distribution[2]}`)
  if (ticker.tier_distribution[3] > 0) tierSummaryParts.push(`Tier 3 × ${ticker.tier_distribution[3]}`)

  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-1">
        <TickerBadge
          symbol={ticker.ticker_symbol}
          name={ticker.company_name}
          logoUrl={ticker.logo_url}
          size="lg"
          showName
        />
      </div>

      <p className="text-sm text-zinc-500 mb-2 ml-11">
        {t('hot_tickers.appears_in', { n: ticker.themes.length })}
        {tierSummaryParts.length > 0 && ` · ${tierSummaryParts.join(' · ')}`}
      </p>

      <ul className="space-y-1 ml-11">
        {ticker.themes.map((th) => (
          <li key={th.id} className="text-sm">
            <Link href={`/themes/${th.id}`} className="text-blue-600 hover:underline">
              {th.name}
            </Link>
            <span className="text-zinc-500 ml-1">· Tier {th.tier}</span>
            {th.role_reasoning && (
              <span className="text-zinc-400"> · {th.role_reasoning}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
