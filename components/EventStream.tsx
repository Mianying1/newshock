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

export function EventStream() {
  const { t, locale } = useI18n()
  const { data } = useSWR<StreamResponse>('/api/events/recent?limit=8', fetcher)

  const events = data?.events ?? []
  const unmatched = data?.unmatched_count ?? 0

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {t('event_stream.title')}
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          <span>{t('event_stream.auto_matched')}</span>
          {unmatched > 0 && (
            <button className="text-zinc-500 hover:text-zinc-900 transition-colors">
              {t('event_stream.show_unmatched', { n: unmatched })}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        {events.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-400">
            {t('common.no_themes')}
          </p>
        ) : (
          events.map((e) => {
            const publisher = getDisplayPublisher(e.source_name, e.source_url)
            const themeName = pickField(locale, e.theme_name, e.theme_name_zh)
            const timeRef = e.published_at ?? e.event_date
            const timeAgo = formatRelativeTime(timeRef, t, locale)

            return (
              <div
                key={e.id}
                className="px-4 py-3 border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400 mb-1">
                  <span className="w-14 shrink-0">{timeAgo}</span>
                  <span className="text-zinc-500">[{publisher}]</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-14 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {e.source_url ? (
                      <a
                        href={e.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-zinc-800 hover:text-zinc-900 hover:underline leading-snug block"
                      >
                        {e.headline}
                      </a>
                    ) : (
                      <span className="text-sm text-zinc-800 leading-snug">
                        {e.headline}
                      </span>
                    )}
                    <div className="mt-1 text-[11px]">
                      {e.theme_id && themeName ? (
                        <Link
                          href={`/themes/${e.theme_id}`}
                          className="text-zinc-500 hover:text-zinc-900 hover:underline"
                        >
                          → {themeName}
                        </Link>
                      ) : (
                        <span className="text-zinc-400 italic">
                          {t('event_stream.no_theme_match')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
