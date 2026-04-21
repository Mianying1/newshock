import Link from 'next/link'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'

export default function ThemeCard({ theme }: { theme: ThemeRadarItem }) {
  const tier1 = theme.recommendations.filter((r) => r.tier === 1)
  const tier2 = theme.recommendations.filter((r) => r.tier === 2)
  const visible = [...tier1, ...tier2].slice(0, 6)
  const overflow = theme.recommendations.length - visible.length
  const pb = theme.archetype_playbook

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
      {pb?.typical_duration_label && pb.typical_duration_label !== 'unknown' && (
        <div className="text-xs text-zinc-500 mt-1">
          ⏱ 类似主题典型持续 {pb.typical_duration_label} (估算) · 当前第 {theme.days_active} 天
          {theme.playbook_stage === 'late' && (
            <span className="text-amber-600 ml-1">(接近尾声)</span>
          )}
          {theme.playbook_stage === 'beyond' && (
            <span className="text-red-600 ml-1">(超出典型范围)</span>
          )}
          {(pb.this_time_different?.differences?.length ?? 0) > 0 && (
            <span className="text-blue-600 ml-1">· 有结构性差异</span>
          )}
        </div>
      )}
    </Link>
  )
}
