'use client'
import type { CatalystEvent } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'

type GroupKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'older'

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

export default function CatalystList({ catalysts }: { catalysts: CatalystEvent[] }) {
  const { t } = useI18n()

  if (catalysts.length === 0) {
    return <p className="text-sm text-zinc-400">{t('theme_detail.no_catalysts')}</p>
  }

  const groups = new Map<GroupKey, CatalystEvent[]>()
  for (const c of catalysts) {
    const key = groupKeyFor(c.days_ago)
    const arr = groups.get(key) ?? []
    arr.push(c)
    groups.set(key, arr)
  }

  return (
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
            <div className="space-y-3">
              {items.map((c) => (
                <div key={c.id}>
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
                    {c.source_name && <span>{c.source_name} · </span>}
                    {c.days_ago === 0
                      ? t('theme_detail.today')
                      : t('relative_time.days_ago', { n: c.days_ago })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
