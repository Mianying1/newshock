'use client'
import Link from 'next/link'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'
import { formatRelativeTime, STAGE_COLORS } from '@/lib/utils'
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

  const daysMax = pb?.typical_duration_days_approx?.[1] || 0
  const progressPercent = daysMax > 0
    ? Math.min(100, Math.round((theme.days_active / daysMax) * 100))
    : 0
  const stageColor = STAGE_COLORS[theme.playbook_stage] ?? 'bg-zinc-300'

  return (
    <Link href={`/themes/${theme.id}`} className="block py-5 hover:bg-zinc-50 transition-colors">
      <p className="text-xl font-semibold text-zinc-900 mb-1">{theme.name}</p>
      <p className="text-sm text-zinc-500 mb-2">
        {formatCategoryLabel(theme.category)} · {t('theme_card.events', { n: theme.event_count })} ·{' '}
        {t('theme_card.active_days', { n: theme.days_active })} · {formatRelativeTime(theme.latest_event_date)}
      </p>
      {visible.length > 0 && (
        <p className="text-sm text-zinc-700 mb-1">
          {t('theme_detail.exposure_mapping')}:{' '}
          {visible.map((r) => r.ticker_symbol).join(', ')}
          {overflow > 0 && <span className="text-zinc-400"> + {overflow} more</span>}
        </p>
      )}
      {pb?.typical_duration_label && pb.typical_duration_label !== 'unknown' && (
        <div className="text-xs text-zinc-500 mt-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span>⏱ {t('theme_card.history_window', { label: pb.typical_duration_label })} · {t('theme_card.active_days', { n: theme.days_active })}</span>
            {theme.playbook_stage !== 'unknown' && (
              <span>({stageLabel[theme.playbook_stage]})</span>
            )}
            {theme.playbook_stage === 'late' && (
              <span className="text-amber-600">· 接近历史上限</span>
            )}
            {theme.playbook_stage === 'beyond' && (
              <span className="text-red-600">· 超出历史区间</span>
            )}
          </div>
          {progressPercent > 0 && (
            <div className="h-1 bg-zinc-100 rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full ${stageColor} transition-all`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      )}
    </Link>
  )
}
