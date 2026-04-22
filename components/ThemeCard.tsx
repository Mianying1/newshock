'use client'
import Link from 'next/link'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'
import { formatRelativeTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { useField } from '@/lib/useField'
import { TickerBadge } from '@/components/TickerBadge'

export default function ThemeCard({ theme }: { theme: ThemeRadarItem }) {
  const { t, locale } = useI18n()
  const themeName = useField(theme, 'name')
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
    beyond_typical: t('theme_card.stage_beyond'),
    unknown: '',
  }

  const statusKey = (() => {
    if (theme.status === 'cooling') return 'status_cooling'
    if (theme.status === 'archived') return 'status_archived'
    if (theme.is_exploratory || theme.status === 'exploratory_candidate') return 'status_exploratory'
    return 'status_active'
  })()

  const statusClass = (() => {
    if (statusKey === 'status_cooling') return 'bg-amber-50 text-amber-700 border-amber-200'
    if (statusKey === 'status_archived') return 'bg-zinc-50 text-zinc-500 border-zinc-200'
    if (statusKey === 'status_exploratory') return 'bg-purple-50 text-purple-700 border-purple-200'
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  })()

  const hotTrackedLine = (() => {
    if (theme.days_hot === theme.days_active) {
      return t('theme_card.hot_days_short', { n: theme.days_hot })
    }
    return `${t('theme_card.hot_days_short', { n: theme.days_hot })} (${t('theme_card.tracked_days_short', { n: theme.days_active })})`
  })()

  const stageText = theme.playbook_stage !== 'unknown' ? stageLabel[theme.playbook_stage] : ''
  const realWorldStart = pb?.real_world_timeline?.approximate_start

  const metaParts: string[] = []
  if (stageText) metaParts.push(`${t('theme_card.stage_prefix')}: ${stageText}`)
  metaParts.push(hotTrackedLine)
  if (realWorldStart) metaParts.push(t('theme_card.since_short', { date: realWorldStart }))

  return (
    <Link href={`/themes/${theme.id}`} className="block py-5 hover:bg-zinc-50 transition-colors">
      {/* Row 1: Title */}
      <p className="text-xl font-semibold text-zinc-900 mb-1.5">{themeName}</p>

      {/* Row 2: Category + Status badges */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded border bg-zinc-50 text-zinc-600 border-zinc-200">
          {formatCategoryLabel(theme.category)}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded border ${statusClass}`}>
          {t(`theme_card.${statusKey}`)}
        </span>
      </div>

      {/* Row 3: Events + updated */}
      <p className="text-xs text-zinc-500 mb-2">
        {t('theme_card.events', { n: theme.event_count })}
        {' · '}
        {t('theme_card.updated_label', { label: formatRelativeTime(theme.latest_event_date, t, locale) })}
      </p>

      {/* Row 4: Tickers */}
      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {visible.map((r) => (
            <TickerBadge
              key={r.ticker_symbol}
              symbol={r.ticker_symbol}
              logoUrl={r.logo_url}
              size="sm"
            />
          ))}
          {overflow > 0 && (
            <span className="text-xs text-zinc-400">+ {overflow} more</span>
          )}
        </div>
      )}

      {/* Row 5: Stage · Hot · Since */}
      {metaParts.length > 0 && (
        <p className="text-xs text-zinc-500">
          {metaParts.join(' · ')}
          {theme.status === 'cooling' && (
            <span className="text-amber-600 ml-2">
              · {t('theme_card.to_archive', { n: theme.days_since_last_event })}
            </span>
          )}
        </p>
      )}
    </Link>
  )
}
