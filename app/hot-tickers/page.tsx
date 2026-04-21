'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import HotTickerCard from '@/components/HotTickerCard'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'

interface HotTickersData {
  total_hot_tickers: number
  tickers: {
    ticker_symbol: string
    company_name: string
    sector: string | null
    themes: { id: string; name: string; tier: number; role_reasoning: string; theme_strength: number }[]
    tier_distribution: Record<number, number>
  }[]
}

export default function HotTickersPage() {
  const { t } = useI18n()
  const [data, setData] = useState<HotTickersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/hot-tickers')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">{t('homepage.title')}</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-zinc-900">{t('nav.themes')}</Link>
            <span className="text-zinc-900 font-medium">{t('nav.hot_tickers')}</span>
            <LocaleToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4">
        <div className="py-4 border-b border-zinc-100 text-center">
          <p className="text-sm text-zinc-500">
            {t('hot_tickers.subtitle')}
            {data && t('hot_tickers.count', { n: data.total_hot_tickers })}
          </p>
        </div>

        <div className="divide-y divide-zinc-200">
          {loading && <p className="py-10 text-center text-zinc-400">{t('theme_detail.loading')}</p>}
          {error && <p className="py-10 text-center text-zinc-400">{t('common.error')}</p>}
          {data?.tickers.map((ticker) => (
            <HotTickerCard key={ticker.ticker_symbol} ticker={ticker} />
          ))}
          {!loading && !error && data?.tickers.length === 0 && (
            <p className="py-10 text-center text-zinc-400">{t('hot_tickers.no_data')}</p>
          )}
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
