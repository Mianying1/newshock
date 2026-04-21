'use client'
import Link from 'next/link'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'
import { formatRelativeTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'

export default function ThemeCard({ theme }: { theme: ThemeRadarItem }) {
  const { t } = useI18n()
  const tier1 = theme.recommendations.filter((r) => r.tier === 1)
  const tier2 = theme.recommendations.filter((r) => r.tier === 2)
  const visible = [...tier1, ...tier2].slice(0, 6)
  const overflow = theme.recommendations.length - visible.length
  const pb = theme.archetype_playbook

  const stageLabel: Record<string, string> = {
    early: t('theme_card.stage_early'),
    mid: t('theme_card.stage_mid'),
    late: t('theme_card.stage_late'),
    beyond: t('theme_card.stage_beyond'),
    unknown: '',
  }

  return (
    <Link href={`/themes/${theme.id}`} className="block py-5 hover:bg-zinc-50 transition-colors">
      <p className="text-xl font-semibold text-zinc-900 mb-1">{theme.name}</p>
      <p className="text-sm text-zinc-500 mb-2">
        {formatCategoryLabel(theme.category)} · {t('theme_card.events', { n: theme.event_count })} ·{' '}
        {t('theme_card.active_days', { n: theme.days_active })} · {formatRelativeTime(theme.latest_event_date)}
      </p>
      {visible.length > 0 && (
        <p className="text-sm text-zinc-700">
          {t('theme_detail.exposure_mapping')}:{' '}
          {visible.map((r) => r.ticker_symbol).join(', ')}
          {overflow > 0 && <span className="text-zinc-400"> + {overflow} more</span>}
        </p>
      )}
      {pb?.typical_duration_label && pb.typical_duration_label !== 'unknown' && (
        <div className="text-xs text-zinc-500 mt-1">
          ⏱ {t('theme_card.history_window', { label: pb.typical_duration_label })} · {t('theme_card.active_days', { n: theme.days_active })}
          {theme.playbook_stage !== 'unknown' && (
            <span className="ml-1">({stageLabel[theme.playbook_stage]})</span>
          )}
          {theme.playbook_stage === 'late' && (
            <span className="text-amber-600"> · 接近历史上限</span>
          )}
          {theme.playbook_stage === 'beyond' && (
            <span className="text-red-600"> · 超出历史区间</span>
          )}
          {(pb.this_time_different?.differences?.length ?? 0) > 0 && (
            <span className="text-blue-600 ml-1">· {t('theme_card.has_differences')}</span>
          )}
        </div>
      )}
    </Link>
  )
}
