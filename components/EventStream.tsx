'use client'
import { useState } from 'react'
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
  theme_id: string | null
  theme_name: string | null
  theme_name_zh: string | null
  theme_status: string | null
}

interface StreamResponse {
  events: StreamEvent[]
  unmatched_count: number
  matched_count: number
  limit: number
  mode: 'matched' | 'unmatched' | 'all'
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
  // Cap unknown long names so badge stays compact
  if (name.length > 10) return name.split(/\s+/)[0].slice(0, 10)
  return name
}

export function EventStream() {
  const { t, locale } = useI18n()
  const [mode, setMode] = useState<'matched' | 'unmatched'>('matched')
  const [showNoise, setShowNoise] = useState(false)
  const { data, error, isLoading } = useSWR<StreamResponse>(
    `/api/events/recent?limit=8&mode=${mode}${showNoise ? '&noise=1' : ''}`,
    fetcher
  )

  const events = data?.events ?? []
  const unmatched = data?.unmatched_count ?? 0
  const isEmpty = !isLoading && !error && events.length === 0

  return (
    <>
      <div className="sec-label">
        <span className="l">{t('event_stream.title')}</span>
        <span className="r">
          {t('event_stream.auto_matched')}
          {mode === 'matched' && unmatched > 0 && (
            <>
              {' · '}
              <a
                onClick={() => setMode('unmatched')}
                style={{ cursor: 'pointer', color: 'var(--link)' }}
              >
                {t('event_stream.show_unmatched', { n: unmatched })}
              </a>
            </>
          )}
          {mode === 'unmatched' && (
            <>
              {' · '}
              <a
                onClick={() => setMode('matched')}
                style={{ cursor: 'pointer', color: 'var(--link)' }}
              >
                {t('event_stream.show_matched')}
              </a>
            </>
          )}
          {' · '}
          <a
            onClick={() => setShowNoise((v) => !v)}
            style={{ cursor: 'pointer', color: 'var(--link)' }}
          >
            {showNoise ? t('event_stream.hide_noise') : t('event_stream.show_noise')}
          </a>
        </span>
      </div>

      <div className="evt-card">
        {isLoading && (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
            {t('event_stream.loading')}
          </div>
        )}
        {error && !isLoading && (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
            {t('event_stream.error')}
          </div>
        )}
        {isEmpty && (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
            {t('event_stream.no_events')}
          </div>
        )}
        {!isLoading && !error && events.length > 0 && (
          events.map((e) => {
            const publisher = getDisplayPublisher(e.source_name, e.source_url)
            const srcCls = SRC_CLASS[publisher] ?? 'src-press'
            const themeName = pickField(locale, e.theme_name, e.theme_name_zh)
            const timeAgo = formatRelativeTime(e.event_date, t, locale)

            const headlineContent = e.source_url ? (
              <a
                href={e.source_url}
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
