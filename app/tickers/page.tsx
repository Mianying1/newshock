'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import TickerRow, { type TickerRowBadge } from '@/components/TickerRow'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'
import { formatMinutesAgo } from '@/lib/utils'
import type { LongShortTickerRow, AngleDirectionRow, LongShortMode } from '@/lib/ticker-scoring'

type TopTab = 'thematic' | 'potential'

interface LongShortResponse {
  mode: LongShortMode
  tickers: LongShortTickerRow[]
  total: number
  limit: number
  updated_at: string
}

interface AnglesResponse {
  directions: AngleDirectionRow[]
  total: number
  limit: number
  updated_at: string
}

export default function TickersPage() {
  const { t } = useI18n()
  const [topTab, setTopTab] = useState<TopTab>('thematic')
  const [mode, setMode] = useState<LongShortMode>('long')

  const [longShortData, setLongShortData] = useState<LongShortResponse | null>(null)
  const [anglesData, setAnglesData] = useState<AnglesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (topTab !== 'thematic') return
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch(`/api/tickers/long-short?tab=${mode}&limit=100`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setLongShortData(d)
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
  }, [topTab, mode])

  useEffect(() => {
    if (topTab !== 'potential') return
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch('/api/new-angle-candidates?limit=100')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setAnglesData(d)
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
  }, [topTab])

  const activeUpdatedAt =
    topTab === 'thematic' ? longShortData?.updated_at : anglesData?.updated_at

  const updatedLabel = activeUpdatedAt
    ? formatMinutesAgo(
        Math.max(0, Math.floor((Date.now() - new Date(activeUpdatedAt).getTime()) / 60000)),
        t
      )
    : ''

  const thematicBySector = useMemo(() => {
    if (!longShortData) return []
    const groups = new Map<string, LongShortTickerRow[]>()
    for (const row of longShortData.tickers) {
      const key = row.sector ?? 'Other'
      const arr = groups.get(key) ?? []
      arr.push(row)
      groups.set(key, arr)
    }
    return Array.from(groups.entries()).sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    )
  }, [longShortData])

  const potentialByUmbrella = useMemo(() => {
    if (!anglesData) return []
    const groups = new Map<string, AngleDirectionRow[]>()
    for (const row of anglesData.directions) {
      const arr = groups.get(row.umbrella_name) ?? []
      arr.push(row)
      groups.set(row.umbrella_name, arr)
    }
    return Array.from(groups.entries()).sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    )
  }, [anglesData])

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">{t('homepage.title')}</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-zinc-900">{t('nav.themes')}</Link>
            <span className="text-zinc-900 font-medium">{t('nav_tickers.hot_tickers')}</span>
            <LocaleToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-10">
        <div className="py-4 border-b border-zinc-100">
          <h1 className="text-xl font-semibold">{t('tickers_ranked.title')}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{t('tickers_ranked.subtitle')}</p>
          {activeUpdatedAt && (
            <p className="text-xs text-zinc-400 mt-1">
              {t('tickers_ranked.updated', { time: updatedLabel })}
            </p>
          )}
        </div>

        <div className="flex gap-1 border-b border-zinc-200">
          <TopTabButton
            label={t('tickers_ranked.tab_thematic')}
            icon="🎯"
            active={topTab === 'thematic'}
            onClick={() => setTopTab('thematic')}
          />
          <TopTabButton
            label={t('tickers_ranked.tab_potential')}
            icon="🌱"
            active={topTab === 'potential'}
            onClick={() => setTopTab('potential')}
          />
        </div>

        {topTab === 'thematic' && (
          <div className="mt-3 flex gap-1">
            <SubTabButton
              label={t('tickers_ranked.subtab_long')}
              active={mode === 'long'}
              onClick={() => setMode('long')}
              tone="long"
            />
            <SubTabButton
              label={t('tickers_ranked.subtab_short')}
              active={mode === 'short'}
              onClick={() => setMode('short')}
              tone="short"
            />
          </div>
        )}

        <div className="py-3">
          <h2 className="text-base font-semibold">
            {topTab === 'thematic'
              ? t('tickers_ranked.thematic_leaders')
              : t('tickers_ranked.potential_leaders')}
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {topTab === 'thematic'
              ? mode === 'long'
                ? t('tickers_ranked.desc_thematic_long')
                : t('tickers_ranked.desc_thematic_short')
              : t('tickers_ranked.desc_potential')}
          </p>
        </div>

        <div>
          {loading && <p className="py-10 text-center text-zinc-400">{t('tickers_ranked.loading')}</p>}
          {error && <p className="py-10 text-center text-zinc-400">{t('common.error')}</p>}

          {!loading && !error && topTab === 'thematic' && longShortData && (
            <>
              {longShortData.tickers.length === 0 ? (
                <p className="py-10 text-center text-zinc-400">
                  {mode === 'long'
                    ? t('tickers_ranked.no_long_tickers')
                    : t('tickers_ranked.no_short_tickers')}
                </p>
              ) : (
                thematicBySector.map(([sector, rows]) => (
                  <section key={sector} className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                      {sector} · {rows.length}
                    </h3>
                    <div className="space-y-2">
                      {rows.map((tk, i) => {
                        const rightBadge: TickerRowBadge | null = tk.category
                          ? { label: t(`categories.${tk.category}`) }
                          : null
                        return (
                          <TickerRow
                            key={tk.symbol}
                            href={`/tickers/${tk.symbol}`}
                            rank={i + 1}
                            symbol={tk.symbol}
                            logoUrl={tk.logo_url}
                            rightText={tk.ticker_maturity_score?.toFixed(1) ?? '-'}
                            rightSmall="/10"
                            sentiment={tk.dominant_sentiment as never}
                            rightBadge={rightBadge}
                          />
                        )
                      })}
                    </div>
                  </section>
                ))
              )}
            </>
          )}

          {!loading && !error && topTab === 'potential' && anglesData && (
            <>
              {anglesData.directions.length === 0 ? (
                <p className="py-10 text-center text-zinc-400">
                  {t('tickers_ranked.no_angles')}
                </p>
              ) : (
                potentialByUmbrella.map(([umbrella, rows]) => (
                  <section key={umbrella} className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                      {umbrella} · {rows.length}
                    </h3>
                    <div className="space-y-2">
                      {rows.map((d, i) => {
                        const inlineBadges: TickerRowBadge[] = []
                        if (d.is_ai_pending) {
                          inlineBadges.push({ label: '🤖' })
                        }
                        inlineBadges.push({
                          label: `📰 ${t('top_tickers.recent_days', { days: d.last_event_days_ago })}`,
                          title: d.angle_label,
                        })
                        const rightBadge: TickerRowBadge | null = d.category
                          ? { label: t(`categories.${d.category}`), title: d.angle_label }
                          : null
                        const confPct = d.confidence !== null ? Math.round(d.confidence * 100) : null
                        return (
                          <TickerRow
                            key={`${d.ticker_symbol}-${d.umbrella_theme_id}-${d.candidate_id}`}
                            href={`/tickers/${d.ticker_symbol}`}
                            rank={i + 1}
                            symbol={d.ticker_symbol}
                            logoUrl={d.logo_url}
                            rightText={confPct !== null ? String(confPct) : undefined}
                            rightSmall={confPct !== null ? '%' : undefined}
                            inlineBadges={inlineBadges}
                            rightBadge={rightBadge}
                          />
                        )
                      })}
                    </div>
                  </section>
                ))
              )}
            </>
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

function TopTabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition ${
        active
          ? 'border-zinc-900 text-zinc-900 font-medium'
          : 'border-transparent text-zinc-500 hover:text-zinc-900'
      }`}
    >
      <span className="mr-1">{icon}</span>
      {label}
    </button>
  )
}

function SubTabButton({
  label,
  active,
  onClick,
  tone,
}: {
  label: string
  active: boolean
  onClick: () => void
  tone: 'long' | 'short'
}) {
  const activeStyle =
    tone === 'long'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
      : 'bg-rose-50 text-rose-700 border-rose-300'
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full border transition ${
        active
          ? activeStyle + ' font-medium'
          : 'bg-white text-zinc-500 border-zinc-200 hover:text-zinc-900'
      }`}
    >
      {label}
    </button>
  )
}
