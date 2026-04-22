'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ThemeCard from '@/components/ThemeCard'
import DataFreshnessIndicator from '@/components/DataFreshnessIndicator'
import OverviewStrip from '@/components/OverviewStrip'
import { LocaleToggle } from '@/components/LocaleToggle'
import { MarketNarratives } from '@/components/MarketNarratives'
import { MarketRegimeCard } from '@/components/MarketRegimeCard'
import { useI18n } from '@/lib/i18n-context'
import type { ThemeRadarItem } from '@/types/recommendations'

export default function HomePage() {
  const { t } = useI18n()
  const [themes, setThemes] = useState<ThemeRadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/themes')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((data) => {
        setThemes(data.themes ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">{t('homepage.title')}</span>
          <nav className="flex items-center gap-4 text-sm">
            <span className="text-zinc-900 font-medium">{t('nav.themes')}</span>
            <Link href="/tickers" className="text-zinc-400 hover:text-zinc-900">
              {t('nav_tickers.hot_tickers')}
            </Link>
            <LocaleToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4">
        <div className="py-4 border-b border-zinc-100 text-center space-y-1">
          <p className="text-sm text-zinc-500">{t('homepage.subtitle')}</p>
          <p className="text-xs">
            <DataFreshnessIndicator />
          </p>
        </div>

        <OverviewStrip />

        <MarketRegimeCard />

        <MarketNarratives />

        <div className="divide-y divide-zinc-200">
          {loading && (
            <p className="py-10 text-center text-zinc-400">{t('theme_detail.loading')}</p>
          )}
          {error && (
            <p className="py-10 text-center text-zinc-400">{t('common.error')}</p>
          )}
          {!loading && !error && themes.length === 0 && (
            <p className="py-10 text-center text-zinc-400">{t('common.no_themes')}</p>
          )}
          {themes.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} />
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
