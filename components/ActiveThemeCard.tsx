'use client'
import Link from 'next/link'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatRelativeTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { useField } from '@/lib/useField'
import { TickerBadge } from '@/components/TickerBadge'

const STAGE_META: Record<string, { dot: string; bar: string; labelKey: string }> = {
  early: {
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-400',
    labelKey: 'theme_card.stage_early',
  },
  mid: {
    dot: 'bg-blue-500',
    bar: 'bg-blue-400',
    labelKey: 'theme_card.stage_mid',
  },
  late: {
    dot: 'bg-amber-500',
    bar: 'bg-amber-400',
    labelKey: 'theme_card.stage_late',
  },
  beyond: {
    dot: 'bg-rose-500',
    bar: 'bg-rose-400',
    labelKey: 'theme_card.stage_beyond',
  },
  unknown: {
    dot: 'bg-zinc-400',
    bar: 'bg-zinc-300',
    labelKey: 'theme_card.stage_mid',
  },
}

function strengthTier(score: number) {
  if (score >= 80) return { key: 'high', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (score >= 50) return { key: 'medium', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { key: 'low', cls: 'bg-zinc-50 text-zinc-600 border-zinc-200' }
}

function tierArrow(direction: string) {
  if (direction === 'benefits') return { icon: '▲', cls: 'text-emerald-600' }
  if (direction === 'headwind') return { icon: '▼', cls: 'text-rose-600' }
  return { icon: '·', cls: 'text-zinc-400' }
}

export function ActiveThemeCard({ theme }: { theme: ThemeRadarItem }) {
  const { t, locale } = useI18n()
  const themeName = useField(theme, 'name')
  const summary = useField(theme, 'summary')

  const stage =
    STAGE_META[theme.playbook_stage] ?? STAGE_META.unknown
  const stageLabel = t(stage.labelKey)

  const pb = theme.archetype_playbook
  const [minDays, maxDays] = pb?.typical_duration_days_approx ?? [0, 0]
  const typicalMid = maxDays > 0 ? Math.round((minDays + maxDays) / 2) : 0
  const progressPct =
    typicalMid > 0
      ? Math.min(100, Math.max(4, (theme.days_hot / typicalMid) * 100))
      : 10

  const tier1 = theme.recommendations.filter((r) => r.tier === 1)
  const tier2 = theme.recommendations.filter((r) => r.tier === 2)
  const visible = [...tier1, ...tier2].slice(0, 4)
  const overflow = theme.recommendations.length - visible.length

  const strength = strengthTier(theme.theme_strength_score)
  const realStart = pb?.real_world_timeline?.approximate_start
  const typicalLabel = pb?.typical_duration_label

  const categoryText = t(`categories.${theme.category}`)

  return (
    <Link
      href={`/themes/${theme.id}`}
      className="block bg-white border border-zinc-200 rounded-lg p-4 hover:border-zinc-400 transition-colors"
    >
      {/* Row 1: name + strength badge */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-zinc-900 leading-snug flex-1 min-w-0">
          {themeName}
        </h3>
        <span
          className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border ${strength.cls}`}
        >
          {theme.theme_strength_score.toFixed(0)}
        </span>
      </div>

      {/* Row 2: summary */}
      {summary && (
        <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2 mb-2">
          {summary}
        </p>
      )}

      {/* Row 3: category + events + time */}
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-3">
        <span className="px-1.5 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-600">
          {categoryText}
        </span>
        <span>·</span>
        <span>{t('theme_card.events', { n: theme.event_count })}</span>
        <span>·</span>
        <span className="text-zinc-400">
          {formatRelativeTime(theme.latest_event_date, t, locale)}
        </span>
      </div>

      {/* Row 4: tickers with arrows */}
      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {visible.map((r) => {
            const arrow = tierArrow(r.exposure_direction)
            return (
              <span key={r.ticker_symbol} className="inline-flex items-center gap-0.5">
                <TickerBadge
                  symbol={r.ticker_symbol}
                  logoUrl={r.logo_url}
                  size="sm"
                />
                <span className={`text-[10px] ${arrow.cls}`}>{arrow.icon}</span>
              </span>
            )
          })}
          {overflow > 0 && (
            <span className="text-[11px] text-zinc-400">+{overflow}</span>
          )}
        </div>
      )}

      {/* Row 5: stage row with dot + bar */}
      <div className="mb-2">
        <div className="flex items-center gap-2 text-[11px] text-zinc-600 mb-1">
          <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
          <span>
            {t('active_themes.stage_bar_mid', { stage: stageLabel })}
          </span>
          <span className="text-zinc-400 ml-auto font-mono">
            {theme.days_hot}d{typicalMid > 0 ? ` / ~${typicalMid}d` : ''}
          </span>
        </div>
        <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${stage.bar} transition-all`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Row 6: footer */}
      <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-2 border-t border-zinc-100">
        {realStart ? (
          <span>{t('active_themes.since', { date: realStart })}</span>
        ) : (
          <span />
        )}
        {typicalLabel && (
          <span>{t('active_themes.est_horizon', { label: typicalLabel })}</span>
        )}
      </div>
    </Link>
  )
}
