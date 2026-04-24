'use client'
import Link from 'next/link'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatRelativeTime } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { useField } from '@/lib/useField'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'

const CATEGORY_TAG: Record<string, { cls: string; labelKey: string }> = {
  geopolitical: { cls: 'geo', labelKey: 'categories.geopolitics' },
  geopolitics: { cls: 'geo', labelKey: 'categories.geopolitics' },
  ai_semi: { cls: 'ai', labelKey: 'categories.ai_semi' },
  tech_breakthrough: { cls: 'ai', labelKey: 'categories.tech_breakthrough' },
  supply_chain: { cls: 'supp', labelKey: 'categories.supply_chain' },
  pharma: { cls: 'pha', labelKey: 'categories.pharma' },
  defense: { cls: 'def', labelKey: 'categories.defense' },
  energy: { cls: 'ene', labelKey: 'categories.energy' },
  materials: { cls: 'mat', labelKey: 'categories.materials' },
  macro_monetary: { cls: 'mun', labelKey: 'categories.macro_monetary' },
}

const STAGE_META: Record<string, { dotCls: string; labelKey: string }> = {
  early: { dotCls: 'early', labelKey: 'theme_card.stage_early' },
  mid: { dotCls: 'mid', labelKey: 'theme_card.stage_mid' },
  late: { dotCls: 'late', labelKey: 'theme_card.stage_late' },
  beyond: { dotCls: 'late', labelKey: 'theme_card.stage_beyond' },
  unknown: { dotCls: 'mid', labelKey: 'theme_card.stage_mid' },
}

function tierDir(direction: string): 'up' | 'down' | 'mixed' {
  if (direction === 'benefits') return 'up'
  if (direction === 'headwind') return 'down'
  return 'mixed'
}

function arrowFor(direction: string): string {
  if (direction === 'benefits') return '▲'
  if (direction === 'headwind') return '▼'
  return '⇅'
}

export function ActiveThemeCard({ theme }: { theme: ThemeRadarItem }) {
  const { t, locale } = useI18n()
  const themeName = useField(theme, 'name')
  const summary = useField(theme, 'summary')
  const stage =
    STAGE_META[theme.playbook_stage] ?? STAGE_META.unknown

  const pb = theme.archetype_playbook
  const [minDays, maxDays] = pb?.typical_duration_days_approx ?? [0, 0]
  const typicalMid = maxDays > 0 ? Math.round((minDays + maxDays) / 2) : 0
  const expectedDays = maxDays > 0 ? maxDays : typicalMid
  const progressPct =
    expectedDays > 0
      ? Math.min(100, Math.max(2, (theme.days_hot / expectedDays) * 100))
      : 10

  const tier1 = theme.recommendations.filter((r) => r.tier === 1)
  const tier2 = theme.recommendations.filter((r) => r.tier === 2)
  const visible = [...tier1, ...tier2].slice(0, 5)
  const overflow = theme.recommendations.length - visible.length

  const catMeta = CATEGORY_TAG[theme.category] ?? { cls: 'low', labelKey: `categories.${theme.category}` }
  const categoryLabel = t(catMeta.labelKey)
  const realStart = pb?.real_world_timeline?.approximate_start
  const typicalLabel = pb?.typical_duration_label
  const lastEventAgo = formatRelativeTime(theme.latest_event_date, t, locale)

  return (
    <Link href={`/themes/${theme.id}`} className="th-card">
      <div className="th-head">
        <div style={{ minWidth: 0 }}>
          <div className="th-title">{themeName}</div>
          {summary && <div className="th-sub">{summary}</div>}
        </div>
        <div className="th-evts"><FocusLevelBadge strength={theme.theme_strength_score} /></div>
      </div>

      <div className="th-tags">
        <span className={`tag ${catMeta.cls}`}>{categoryLabel}</span>
        <span className="txt">
          {t('theme_card.events', { n: theme.event_count })} · {lastEventAgo}
        </span>
      </div>

      {visible.length > 0 && (
        <div className="th-tickers">
          {visible.map((r) => {
            const dir = tierDir(r.exposure_direction)
            return (
              <span key={r.ticker_symbol} className={`tkr ${dir}`}>
                ${r.ticker_symbol}
                <span className="arr">{arrowFor(r.exposure_direction)}</span>
              </span>
            )
          })}
          {overflow > 0 && <span className="tkr-more">+{overflow} more</span>}
        </div>
      )}

      <div className="th-life">
        <div className="th-life-head">
          <div className="st">
            <span className={`stage-dot ${stage.dotCls}`} />
            <span>
              {t(stage.labelKey)}
              {theme.status === 'cooling' ? ` · ${t('theme_card.status_cooling').toLowerCase()}` : ' · active'}
            </span>
          </div>
          <div>
            <span className="mono">{theme.days_hot}d</span>
            {expectedDays > 0 && (
              <>
                {' / '}
                <span className="mono" style={{ color: 'var(--ink-4)' }}>
                  ~{expectedDays}d expected
                </span>
              </>
            )}
          </div>
        </div>
        <div className="stage-bar">
          <i style={{ width: `${progressPct}%` }} />
          <span className="now" style={{ left: `${progressPct}%` }} />
        </div>
        <div className="th-life-meta">
          {realStart ? (
            <span>{t('active_themes.since', { date: realStart })}</span>
          ) : (
            <span />
          )}
          {typicalLabel && (
            <span>{t('active_themes.est_horizon', { label: typicalLabel })}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
