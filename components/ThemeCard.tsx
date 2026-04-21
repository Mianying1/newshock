import Link from 'next/link'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'

export default function ThemeCard({ theme }: { theme: ThemeRadarItem }) {
  const tier1 = theme.recommendations.filter((r) => r.tier === 1)
  const tier2 = theme.recommendations.filter((r) => r.tier === 2)
  const visible = [...tier1, ...tier2].slice(0, 6)
  const overflow = theme.recommendations.length - visible.length

  return (
    <Link href={`/themes/${theme.id}`} className="block py-5 hover:bg-zinc-50 transition-colors">
      <p className="text-xl font-semibold text-zinc-900 mb-1">{theme.name}</p>
      <p className="text-sm text-zinc-500 mb-2">
        {formatCategoryLabel(theme.category)} · {theme.event_count} events · {theme.days_active} days active
      </p>
      {visible.length > 0 && (
        <p className="text-sm text-zinc-700">
          推荐:{' '}
          {visible.map((r) => r.ticker_symbol).join(', ')}
          {overflow > 0 && <span className="text-zinc-400"> + {overflow} more</span>}
        </p>
      )}
    </Link>
  )
}
