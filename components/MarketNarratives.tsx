'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n-context'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface RelatedTheme {
  id: string
  name: string
  category: string
  event_count: number
}

interface Narrative {
  id: string
  title: string
  description: string
  aggregate_ticker_count: number | null
  top_chokepoint_tickers: string[] | null
  related_themes: RelatedTheme[]
  rank: number
}

export function MarketNarratives() {
  const { t } = useI18n()
  const { data } = useSWR<{ narratives: Narrative[] }>('/api/narratives', fetcher)

  if (!data?.narratives || data.narratives.length === 0) return null

  return (
    <section className="py-4 border-b border-zinc-100 mb-2">
      <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-3">
        {t('narratives.heading')}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.narratives.slice(0, 3).map((n) => (
          <div
            key={n.id}
            className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 hover:border-zinc-300 transition-colors"
          >
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
              {t('narratives.narrative')}
            </div>
            <h3 className="font-semibold text-sm mb-1.5 text-zinc-900 leading-snug">
              {n.title}
            </h3>
            <p className="text-xs text-zinc-600 mb-3 line-clamp-2 leading-relaxed">
              {n.description}
            </p>

            {n.related_themes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {n.related_themes.slice(0, 3).map((th) => (
                  <Link
                    key={th.id}
                    href={`/themes/${th.id}`}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors truncate max-w-[120px]"
                    title={th.name}
                  >
                    {th.name.split(' · ')[0]}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>{t('narratives.tickers', { n: n.aggregate_ticker_count ?? 0 })}</span>
              {(n.top_chokepoint_tickers?.length ?? 0) > 0 && (
                <span className="font-mono flex gap-1">
                  {n.top_chokepoint_tickers!.slice(0, 3).map((sym, idx) => (
                    <span key={sym}>
                      <Link
                        href={`/tickers/${sym}`}
                        className="text-zinc-500 hover:text-zinc-900 hover:underline"
                      >
                        {sym}
                      </Link>
                      {idx < Math.min(2, n.top_chokepoint_tickers!.length - 1) && (
                        <span className="text-zinc-400 ml-1">·</span>
                      )}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
