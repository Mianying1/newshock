'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { getDisplayPublisher } from '@/lib/source-display'
import { formatRelativeTime } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface StreamEvent {
  id: string
  headline: string
  source_name: string | null
  source_url: string | null
  event_date: string
  published_at: string | null
  theme_id: string | null
  theme_name: string | null
  theme_name_zh: string | null
  theme_status: string | null
}

interface StreamResponse {
  events: StreamEvent[]
  unmatched_count: number
  limit: number
}

const SRC_CLASS: Record<string, string> = {
  Reuters: 'src-reuters',
  Bloomberg: 'src-bloomberg',
  WSJ: 'src-wsj',
  'Financial Times': 'src-ft',
  CNBC: 'src-cnbc',
  NYT: 'src-nyt',
  'Nikkei Asia': 'src-nikkei',
  Nikkei: 'src-nikkei',
  CoinDesk: 'src-coindesk',
  SEC: 'src-sec',
}

function shortPublisher(name: string): string {
  if (name === 'Financial Times') return 'FT'
  if (name === 'Nikkei Asia') return 'Nikkei'
  if (name === "Investor's Business Daily") return 'IBD'
  if (name === 'GlobeNewswire') return 'Globe'
  if (name === 'PR Newswire') return 'PRNews'
  if (name === 'BusinessWire') return 'BizWire'
  return name
}

export function EventStream() {
  const { t, locale } = useI18n()
  const { data } = useSWR<StreamResponse>('/api/events/recent?limit=8', fetcher)

  const events = data?.events ?? []
  const unmatched = data?.unmatched_count ?? 0

  return (
    <>
      <div className="sec-label">
        <span className="l">{t('event_stream.title')}</span>
        <span className="r">
          {t('event_stream.auto_matched')}
          {unmatched > 0 && (
            <>
              {' · '}
              <a>{t('event_stream.show_unmatched', { n: unmatched })}</a>
            </>
          )}
        </span>
      </div>

      <div className="evt-card">
        {events.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
            {t('common.no_themes')}
          </div>
        ) : (
          events.map((e) => {
            const publisher = getDisplayPublisher(e.source_name, e.source_url)
            const srcCls = SRC_CLASS[publisher] ?? ''
            const themeName = pickField(locale, e.theme_name, e.theme_name_zh)
            const timeRef = e.published_at ?? e.event_date
            const timeAgo = formatRelativeTime(timeRef, t, locale)

            const headlineContent = e.source_url ? (
              <a
                href={e.source_url}
                target="_blank"
                rel="noreferrer"
                className="evt-headline"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {e.headline}
              </a>
            ) : (
              <div className="evt-headline">{e.headline}</div>
            )

            return (
              <div className="evt-row" key={e.id}>
                <div className="evt-time">{timeAgo}</div>
                <div>
                  <span className={`src ${srcCls}`}>{shortPublisher(publisher)}</span>
                </div>
                {headlineContent}
                {e.theme_id && themeName ? (
                  <Link href={`/themes/${e.theme_id}`} className="evt-link">
                    → {themeName}
                  </Link>
                ) : (
                  <span className="evt-link muted">
                    {t('event_stream.no_theme_match')}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
