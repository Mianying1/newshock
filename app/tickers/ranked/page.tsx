'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RankedTickerCard from '@/components/RankedTickerCard'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'
import { formatMinutesAgo } from '@/lib/utils'
import type { TickerScores } from '@/lib/ticker-scoring'

type SortKey = 'thematic' | 'momentum' | 'potential' | 'composite'

interface RankedResponse {
  tickers: TickerScores[]
  total: number
  sort: SortKey
  limit: number
  updated_at: string
}

const TABS: { key: SortKey; icon: string; tabKey: string }[] = [
  { key: 'composite', icon: '📊', tabKey: 'tab_composite' },
  { key: 'thematic', icon: '🎯', tabKey: 'tab_thematic' },
  { key: 'momentum', icon: '🔥', tabKey: 'tab_momentum' },
  { key: 'potential', icon: '🌱', tabKey: 'tab_potential' },
]

const HEADING_KEY: Record<SortKey, string> = {
  thematic: 'thematic_leaders',
  momentum: 'momentum_leaders',
  potential: 'potential_leaders',
  composite: 'composite_leaders',
}

const DESC_KEY: Record<SortKey, string> = {
  thematic: 'desc_thematic',
  momentum: 'desc_momentum',
  potential: 'desc_potential',
  composite: 'desc_composite',
}

export default function RankedTickersPage() {
  const { t } = useI18n()
  const [sort, setSort] = useState<SortKey>('composite')
  const [data, setData] = useState<RankedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch(`/api/tickers/ranked?sort=${sort}&limit=50`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sort])

  const updatedLabel = data
    ? formatMinutesAgo(
        Math.max(0, Math.floor((Date.now() - new Date(data.updated_at).getTime()) / 60000)),
        t
      )
    : ''

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">{t('homepage.title')}</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-zinc-900">{t('nav.themes')}</Link>
            <span className="text-zinc-900 font-medium">{t('nav_tickers.ranked')}</span>
            <Link href="/hot-tickers" className="text-zinc-400 hover:text-zinc-900">{t('nav_tickers.chokepoints')}</Link>
            <LocaleToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-10">
        <div className="py-4 border-b border-zinc-100">
          <h1 className="text-xl font-semibold">{t('tickers_ranked.title')}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{t('tickers_ranked.subtitle')}</p>
          {data && (
            <p className="text-xs text-zinc-400 mt-1">
              {t('tickers_ranked.updated', { time: updatedLabel })}
            </p>
          )}
        </div>

        <div className="flex gap-1 border-b border-zinc-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSort(tab.key)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition ${
                sort === tab.key
                  ? 'border-zinc-900 text-zinc-900 font-medium'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {t(`tickers_ranked.${tab.tabKey}`)}
            </button>
          ))}
        </div>

        <div className="py-3">
          <h2 className="text-base font-semibold">{t(`tickers_ranked.${HEADING_KEY[sort]}`)}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{t(`tickers_ranked.${DESC_KEY[sort]}`)}</p>
        </div>

        <div className="space-y-2">
          {loading && <p className="py-10 text-center text-zinc-400">{t('tickers_ranked.loading')}</p>}
          {error && <p className="py-10 text-center text-zinc-400">{t('common.error')}</p>}
          {!loading && !error && data?.tickers.length === 0 && (
            <p className="py-10 text-center text-zinc-400">{t('tickers_ranked.no_data')}</p>
          )}
          {data?.tickers.map((ticker, idx) => (
            <RankedTickerCard
              key={ticker.symbol}
              ticker={ticker}
              rank={idx + 1}
              primaryKey={sort}
            />
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 mt-10">
        <p className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-zinc-400">
          {t('common.disclaimer_footer')}
        </p>
      </footer>
    </div>
  )
}
