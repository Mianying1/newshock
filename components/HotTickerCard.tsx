import Link from 'next/link'

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
  themes: ThemeRef[]
  tier_distribution: Record<number, number>
}

export default function HotTickerCard({ ticker }: { ticker: HotTicker }) {
  const tierSummaryParts: string[] = []
  if (ticker.tier_distribution[1] > 0) tierSummaryParts.push(`Tier 1 × ${ticker.tier_distribution[1]}`)
  if (ticker.tier_distribution[2] > 0) tierSummaryParts.push(`Tier 2 × ${ticker.tier_distribution[2]}`)
  if (ticker.tier_distribution[3] > 0) tierSummaryParts.push(`Tier 3 × ${ticker.tier_distribution[3]}`)

  return (
    <div className="py-4">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-mono font-semibold text-xl text-zinc-900">
          ${ticker.ticker_symbol}
        </span>
        {ticker.company_name && ticker.company_name !== ticker.ticker_symbol && (
          <span className="text-base text-zinc-600">{ticker.company_name}</span>
        )}
      </div>

      <p className="text-sm text-zinc-500 mb-2">
        出现在 {ticker.themes.length} 个主题
        {tierSummaryParts.length > 0 && ` · ${tierSummaryParts.join(' · ')}`}
      </p>

      <ul className="space-y-1">
        {ticker.themes.map((t) => (
          <li key={t.id} className="text-sm">
            <Link href={`/themes/${t.id}`} className="text-blue-600 hover:underline">
              {t.name}
            </Link>
            <span className="text-zinc-500 ml-1">· Tier {t.tier}</span>
            {t.role_reasoning && (
              <span className="text-zinc-400"> · {t.role_reasoning}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
