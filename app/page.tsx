'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Sidebar } from '@/components/Sidebar'
import { MarketRegimeCard } from '@/components/MarketRegimeCard'
import { MarketNarratives } from '@/components/MarketNarratives'
import { TopTickersSection } from '@/components/TopTickersSection'
import { EventStream } from '@/components/EventStream'
import { ActiveThemeCard } from '@/components/ActiveThemeCard'
import StageAlertsSection from '@/components/StageAlertsSection'
import { useI18n } from '@/lib/i18n-context'
import type { ThemeRadarItem } from '@/types/recommendations'
import './radar.css'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Overview {
  active_count: number
  cooling_count: number
  narratives_count: number
  events_7d: number
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.13.68.35.94.62l.06.05A2 2 0 1 1 21 14h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function LangSwitch() {
  const { locale, setLocale } = useI18n()
  return (
    <div className="lang-switch">
      <button className={locale === 'en' ? 'on' : ''} onClick={() => setLocale('en')}>EN</button>
      <button className={locale === 'zh' ? 'on' : ''} onClick={() => setLocale('zh')}>中</button>
    </div>
  )
}

function useHeaderDate(locale: 'en' | 'zh') {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (locale === 'zh') {
      const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
      setLabel(`${weekday} · ${d.getMonth() + 1}月${d.getDate()}日 · ${hh}:${mm}`)
    } else {
      const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
      setLabel(`${weekday} · ${month} ${d.getDate()} · ${hh}:${mm}`)
    }
  }, [locale])
  return label
}

export default function HomePage() {
  const { t, locale } = useI18n()
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

  const activeThemes = themes.filter((th) => th.status !== 'archived')
  const umbrellaThemes = activeThemes.filter((th) => th.theme_tier === 'umbrella')
  const subthemes = activeThemes.filter((th) => th.theme_tier !== 'umbrella')
  const totalThemes = activeThemes.length
  const visibleThemes = activeThemes.slice(0, 12)
  const narrativesCount = overview?.narratives_count ?? 0
  const eventsWeek = overview?.events_7d ?? 0
  const headerDate = useHeaderDate(locale)

  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="topbar">
            <div className="search is-disabled" aria-disabled>
              <SearchIcon />
              <span className="ph">{t('topbar.search_placeholder')}</span>
              <span className="soon">{t('topbar.search_soon')}</span>
            </div>
            <LangSwitch />
            <button className="iconbtn" aria-label="Settings" type="button">
              <SettingsIcon />
            </button>
          </div>

          <div className="page-head">
            <h1 className="page-title">{t('radar.today_on_radar')}</h1>
            <div className="page-sub">
              {headerDate && <span>{headerDate}</span>}
              {headerDate && <span className="sep">·</span>}
              <span className="dot" />
              <span>{t('radar.narratives_count', { n: narrativesCount })}</span>
              <span className="sep">·</span>
              <span>{t('radar.active_themes_count', { n: totalThemes })}</span>
              <span className="sep">·</span>
              <span>{t('radar.events_scanned_7d', { n: eventsWeek })}</span>
            </div>
          </div>

          <MarketRegimeCard />

          <StageAlertsSection />

          <TopTickersSection />

          <MarketNarratives />

          <EventStream />

          <div className="sec-label">
            <span className="l">{t('active_themes.core_title')}</span>
            <span className="r">
              {t('active_themes.showing', { n: umbrellaThemes.length })}
            </span>
          </div>

          {loading && (
            <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('theme_detail.loading')}
            </p>
          )}
          {error && (
            <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('common.error')}
            </p>
          )}
          {!loading && !error && visibleThemes.length === 0 && (
            <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('common.no_themes')}
            </p>
          )}

          {umbrellaThemes.length > 0 && (
            <div className="themes-grid">
              {umbrellaThemes.map((theme) => (
                <ActiveThemeCard key={theme.id} theme={theme} />
              ))}
            </div>
          )}

          {subthemes.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="sec-label">
                <span className="l">{t('active_themes.subtheme_title')}</span>
                <span className="r">{t('active_themes.showing', { n: subthemes.length })}</span>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
                <Link
                  href="/themes?tier=subtheme"
                  style={{
                    fontSize: 13,
                    color: 'var(--ink-2)',
                    textDecoration: 'none',
                    padding: '8px 16px',
                    border: '1px solid var(--line-2)',
                    borderRadius: 999,
                    display: 'inline-block',
                  }}
                >
                  {t('active_themes.expand_subthemes', { count: subthemes.length })}
                </Link>
              </div>
            </div>
          )}

          <div className="curator-strip">
            <div className="avatar">MC</div>
            <div className="who">
              <span style={{ color: 'var(--ink-3)' }}>{t('curator_strip.by')}</span>{' '}
              <b>Mianying Chen</b> · {t('curator_strip.role')}
            </div>
            <span className="disclaim">{t('curator_strip.disclaim')}</span>
          </div>
        </main>
      </div>
    </div>
  )
}
