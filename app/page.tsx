'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { LocaleToggle } from '@/components/LocaleToggle'
import { Sidebar } from '@/components/Sidebar'
import { MarketRegimeCard } from '@/components/MarketRegimeCard'
import { MarketNarratives } from '@/components/MarketNarratives'
import { TopTickersSection } from '@/components/TopTickersSection'
import { EventStream } from '@/components/EventStream'
import { ActiveThemeCard } from '@/components/ActiveThemeCard'
import { useI18n } from '@/lib/i18n-context'
import type { ThemeRadarItem } from '@/types/recommendations'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Overview {
  active_count: number
  cooling_count: number
  narratives_count: number
  events_7d: number
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

export default function HomePage() {
  const { t } = useI18n()
  const [themes, setThemes] = useState<ThemeRadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const { data: overview } = useSWR<Overview>('/api/meta/overview', fetcher, {
    refreshInterval: 60_000,
  })

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

  const activeThemes = themes.filter((t) => t.status !== 'archived')
  const themeCount = activeThemes.length
  const narrativesCount = overview?.narratives_count ?? 0
  const eventsWeek = overview?.events_7d ?? 0

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Sidebar />

      <div className="md:ml-[220px]">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-zinc-200">
          <div className="flex items-center justify-between px-6 py-3 gap-4">
            <div
              className="flex-1 max-w-md flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-400 cursor-not-allowed"
              aria-disabled
            >
              <SearchIcon />
              <span className="text-xs">{t('topbar.search_placeholder')}</span>
            </div>
            <div className="flex items-center gap-3">
              <LocaleToggle />
            </div>
          </div>
        </div>

        <main className="max-w-5xl mx-auto px-6 py-6">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-2xl font-semibold text-zinc-900 mb-1">
              {t('radar.today_on_radar')}
            </h1>
            <p className="text-xs text-zinc-500 font-mono">
              {t('radar.active_themes_count', { n: themeCount })}
              {' · '}
              {t('radar.narratives_count', { n: narrativesCount })}
              {' · '}
              {t('radar.events_scanned_7d', { n: eventsWeek })}
            </p>
          </header>

          <MarketRegimeCard />

          <TopTickersSection />

          <MarketNarratives />

          <EventStream />

          {/* Active Themes grid */}
          <section className="mb-10">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                {t('active_themes.title')}
              </h2>
              <span className="text-[11px] text-zinc-400">
                {t('active_themes.showing', { n: activeThemes.length })}
                {' · '}
                {t('active_themes.sorted_by_strength')}
              </span>
            </div>

            {loading && (
              <p className="py-10 text-center text-zinc-400 text-xs">
                {t('theme_detail.loading')}
              </p>
            )}
            {error && (
              <p className="py-10 text-center text-zinc-400 text-xs">
                {t('common.error')}
              </p>
            )}
            {!loading && !error && activeThemes.length === 0 && (
              <p className="py-10 text-center text-zinc-400 text-xs">
                {t('common.no_themes')}
              </p>
            )}

            {activeThemes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeThemes.map((theme) => (
                  <ActiveThemeCard key={theme.id} theme={theme} />
                ))}
              </div>
            )}

            <p className="mt-4 text-[10px] text-zinc-400 text-center">
              {t('disclaimer.framework_matches')}
            </p>
          </section>

          {/* Curator footer */}
          <footer className="border-t border-zinc-200 mt-10 pt-6 pb-10 text-center space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-zinc-400">
              {t('curator.title')}
            </p>
            <p className="text-xs text-zinc-500">{t('curator.signature')}</p>
            <p className="text-[10px] text-zinc-400 pt-2">
              {t('common.disclaimer_footer')}
            </p>
          </footer>
        </main>
      </div>
    </div>
  )
}
