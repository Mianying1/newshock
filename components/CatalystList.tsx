'use client'
import { useState } from 'react'
import type { CatalystEvent, EventDirection } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { getDisplayPublisher } from '@/lib/source-display'

type GroupKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'older'
type TabKey = 'all' | EventDirection

const GROUP_ORDER: GroupKey[] = ['today', 'yesterday', 'this_week', 'last_week', 'older']

const GROUP_LABEL_KEY: Record<GroupKey, string> = {
  today: 'theme_detail.events_today',
  yesterday: 'theme_detail.events_yesterday',
  this_week: 'theme_detail.events_this_week',
  last_week: 'theme_detail.events_last_week',
  older: 'theme_detail.events_older',
}

function groupKeyFor(daysAgo: number): GroupKey {
  if (daysAgo <= 0) return 'today'
  if (daysAgo === 1) return 'yesterday'
  if (daysAgo < 7) return 'this_week'
  if (daysAgo < 14) return 'last_week'
  return 'older'
}

function directionClasses(dir: EventDirection | null): { border: string; badge: string; dot: string } {
  if (dir === 'supports') return { border: 'border-emerald-400', badge: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' }
  if (dir === 'contradicts') return { border: 'border-rose-400', badge: 'text-rose-700 bg-rose-50', dot: 'bg-rose-500' }
  return { border: 'border-zinc-300', badge: 'text-zinc-600 bg-zinc-100', dot: 'bg-zinc-400' }
}

export default function CatalystList({ catalysts }: { catalysts: CatalystEvent[] }) {
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<TabKey>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (catalysts.length === 0) {
    return <p className="text-sm text-zinc-400">{t('theme_detail.no_catalysts')}</p>
  }

  const counts = {
    all: catalysts.length,
    supports: catalysts.filter((c) => c.supports_or_contradicts === 'supports').length,
    contradicts: catalysts.filter((c) => c.supports_or_contradicts === 'contradicts').length,
    neutral: catalysts.filter((c) => c.supports_or_contradicts === 'neutral').length,
  }
  const hasAnyDirection = counts.supports + counts.contradicts + counts.neutral > 0

  const filtered = tab === 'all'
    ? catalysts
    : catalysts.filter((c) => c.supports_or_contradicts === tab)

  const groups = new Map<GroupKey, CatalystEvent[]>()
  for (const c of filtered) {
    const key = groupKeyFor(c.days_ago)
    const arr = groups.get(key) ?? []
    arr.push(c)
    groups.set(key, arr)
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tabBtn = (key: TabKey, labelKey: string, count: number, dir: EventDirection | null) => {
    const active = tab === key
    const { dot } = directionClasses(dir)
    return (
      <button
        key={key}
        onClick={() => setTab(key)}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          active
            ? 'border-zinc-900 bg-zinc-900 text-white'
            : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400'
        }`}
      >
        {dir !== null && <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot} mr-1.5 align-middle`} />}
        {t(labelKey)}
        <span className={`ml-1.5 tabular-nums ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{count}</span>
      </button>
    )
  }

  return (
    <div>
      {hasAnyDirection && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tabBtn('all', 'theme_detail.tab_all', counts.all, null)}
          {tabBtn('supports', 'theme_detail.supports', counts.supports, 'supports')}
          {tabBtn('contradicts', 'theme_detail.contradicts', counts.contradicts, 'contradicts')}
          {tabBtn('neutral', 'theme_detail.neutral', counts.neutral, 'neutral')}
        </div>
      )}

      <div className="space-y-4">
        {GROUP_ORDER.map((key) => {
          const items = groups.get(key)
          if (!items || items.length === 0) return null
          return (
            <div key={key}>
              <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                {t(GROUP_LABEL_KEY[key])}
                <span className="ml-1.5 font-normal normal-case">({items.length})</span>
              </h4>
              <div className="space-y-2">
                {items.map((c) => {
                  const publisher = getDisplayPublisher(c.source_name, c.source_url)
                  const classes = directionClasses(c.supports_or_contradicts)
                  const reasoning = pickField(
                    locale,
                    c.counter_evidence_reasoning,
                    c.counter_evidence_reasoning_zh
                  )
                  const isExpanded = expanded.has(c.id)
                  const canExpand = !!reasoning
                  return (
                    <div
                      key={c.id}
                      className={`border-l-2 ${classes.border} pl-3 py-0.5`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {c.source_url ? (
                            <a
                              href={c.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {c.headline}
                            </a>
                          ) : (
                            <p className="text-sm text-zinc-900">{c.headline}</p>
                          )}
                          <p className="text-xs text-zinc-400 mt-0.5">
                            <span>{publisher} · </span>
                            {c.days_ago === 0
                              ? t('theme_detail.today')
                              : t('relative_time.days_ago', { n: c.days_ago })}
                            {canExpand && (
                              <button
                                onClick={() => toggleExpand(c.id)}
                                className="ml-2 text-zinc-500 hover:text-zinc-800 underline"
                              >
                                {isExpanded ? t('theme_detail.collapse') : t('theme_detail.counter_reasoning')}
                              </button>
                            )}
                          </p>
                          {isExpanded && reasoning && (
                            <p className="text-xs text-zinc-600 mt-1.5 italic leading-relaxed">
                              {reasoning}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
