'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { TickerBadge } from '@/components/TickerBadge'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { getDisplayPublisher } from '@/lib/source-display'
import { STAGE_COLORS } from '@/lib/utils'
import type { TickerScores } from '@/lib/ticker-scoring'

interface ThemeResult {
  id: string
  name: string
  name_zh: string | null
  status: string
  category: string | null
  tier: number
  exposure_direction: string
  role_reasoning: string
  role_reasoning_zh: string | null
  first_seen_at: string
  days_hot: number
  days_active: number
  theme_strength_score: number
  typical_duration_days_min: number | null
  typical_duration_days_max: number | null
  playbook_stage: 'early' | 'mid' | 'late' | 'beyond' | 'unknown'
}

interface EventItem {
  id: string
  headline: string
  source_name: string | null
  source_url: string | null
  event_date: string
  theme_id: string | null
  theme_name: string | null
  theme_name_zh: string | null
}

interface ExitSignal {
  signal: string
  themes: string[]
}

interface TickerDetailResponse {
  ticker: {
    symbol: string
    company_name: string | null
    sector: string | null
    logo_url: string | null
  }
  scores: TickerScores | null
  themes: ThemeResult[]
  recent_events: EventItem[]
  exit_signals: ExitSignal[]
}

const DIRECTION_KEY: Record<string, string> = {
  benefits: 'theme_detail.direction_benefits',
  headwind: 'theme_detail.direction_headwind',
  mixed: 'theme_detail.direction_mixed',
  uncertain: 'theme_detail.direction_uncertain',
}

const DIRECTION_COLOR: Record<string, string> = {
  benefits: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  headwind: 'bg-rose-50 text-rose-700 border-rose-200',
  mixed: 'bg-blue-50 text-blue-700 border-blue-200',
  uncertain: 'bg-zinc-50 text-zinc-600 border-zinc-200',
}

const STATUS_KEY: Record<string, string> = {
  active: 'theme_card.status_active',
  cooling: 'theme_card.status_cooling',
  archived: 'theme_card.status_archived',
  exploratory_candidate: 'theme_card.status_exploratory',
}

function stageLabel(stage: ThemeResult['playbook_stage'], t: (k: string, v?: Record<string, string | number>) => string): string {
  if (stage === 'unknown') return ''
  const map: Record<string, string> = {
    early: 'theme_card.stage_early',
    mid: 'theme_card.stage_mid',
    late: 'theme_card.stage_late',
    beyond: 'theme_card.stage_beyond',
  }
  return t(map[stage])
}

function formatDateShort(iso: string, locale: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function TickerDetailPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const params = useParams<{ symbol: string }>()
  const symbol = params?.symbol?.toString().toUpperCase() ?? ''

  const [data, setData] = useState<TickerDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [showAllEvents, setShowAllEvents] = useState(false)

  useEffect(() => {
    if (!symbol) return
    fetch(`/api/tickers/${symbol}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true)
          setLoading(false)
          return null
        }
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (!d) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [symbol])

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-zinc-900">
        <p className="max-w-3xl mx-auto px-4 py-10 text-center text-zinc-400">
          {t('ticker_detail.loading')}
        </p>
      </div>
    )
  }

  if (error || notFound || !data) {
    return (
      <div className="min-h-screen bg-white text-zinc-900">
        <div className="max-w-3xl mx-auto px-4 py-10 text-center">
          <p className="text-zinc-400 mb-4">
            {notFound ? t('ticker_detail.not_found') : t('ticker_detail.error')}
          </p>
          <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline">
            {t('ticker_detail.back')}
          </button>
        </div>
      </div>
    )
  }

  const { ticker, scores, themes, recent_events, exit_signals } = data
  const displayedEvents = showAllEvents ? recent_events : recent_events.slice(0, 5)

  const timelineMinStart = themes.length > 0
    ? Math.min(...themes.map((th) => new Date(th.first_seen_at).getTime()))
    : Date.now()
  const now = Date.now()
  const timelineMaxEnd = themes.length > 0
    ? Math.max(
        ...themes.map((th) => {
          const ceiling = th.typical_duration_days_max ?? 180
          return new Date(th.first_seen_at).getTime() + ceiling * 86400000
        }),
        now
      )
    : now
  const timelineSpan = Math.max(1, timelineMaxEnd - timelineMinStart)

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">{t('homepage.title')}</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-zinc-900">{t('nav.themes')}</Link>
            <Link href="/tickers" className="text-zinc-400 hover:text-zinc-900">{t('nav_tickers.hot_tickers')}</Link>
            <LocaleToggle />
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-10">
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm text-zinc-500 hover:text-zinc-900"
        >
          {t('ticker_detail.back')}
        </button>

        <section className="mt-4 pb-6 border-b border-zinc-100">
          <div className="flex items-center gap-3 mb-2">
            <TickerBadge
              symbol={ticker.symbol}
              name={ticker.company_name ?? ticker.symbol}
              logoUrl={ticker.logo_url}
              size="lg"
              showName
            />
          </div>
          {ticker.sector && (
            <p className="text-sm text-zinc-500">{ticker.sector}</p>
          )}
          {scores && (
            <div className="mt-4 grid grid-cols-2 gap-3 max-w-sm">
              <ScoreBox label={t('ticker_detail.thematic_score')} value={scores.thematic_score} accent="emerald" />
              <ScoreBox label={t('ticker_detail.potential_score')} value={scores.potential_score} accent="blue" />
            </div>
          )}
          {scores && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
              <span>
                {t('ticker_detail.themes_count_label')}:{' '}
                <span className="font-mono text-zinc-700">{scores.themes_count}</span>
              </span>
              <span>
                {t('ticker_detail.recent_events_7d')}:{' '}
                <span className="font-mono text-zinc-700">{scores.recent_events_7d}</span>
              </span>
              <span>
                {t('ticker_detail.recent_events_30d')}:{' '}
                <span className="font-mono text-zinc-700">{scores.recent_events_30d}</span>
              </span>
              {scores.dominant_category && (
                <span>
                  {t('ticker_detail.dominant_category')}:{' '}
                  <span className="text-zinc-700">{t(`categories.${scores.dominant_category}`)}</span>
                </span>
              )}
            </div>
          )}
        </section>

        <section className="py-6 border-b border-zinc-100">
          <h2 className="text-base font-semibold mb-3">{t('ticker_detail.related_themes')}</h2>
          {themes.length === 0 ? (
            <p className="text-sm text-zinc-400">{t('ticker_detail.no_themes')}</p>
          ) : (
            <div className="space-y-2">
              {themes.map((th) => {
                const statusKey = STATUS_KEY[th.status] ?? 'theme_card.status_active'
                const dirKey = DIRECTION_KEY[th.exposure_direction] ?? DIRECTION_KEY.uncertain
                const dirColor = DIRECTION_COLOR[th.exposure_direction] ?? DIRECTION_COLOR.uncertain
                const themeName = pickField(locale, th.name, th.name_zh)
                const reasoning = pickField(locale, th.role_reasoning, th.role_reasoning_zh)
                return (
                  <div key={th.id} className="border border-zinc-200 rounded-lg p-3 hover:border-zinc-400 transition">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/themes/${th.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                        {themeName}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded border ${dirColor} shrink-0`}>
                        {t(dirKey)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-zinc-500">
                      <span>{t('ticker_detail.tier_label', { n: th.tier })}</span>
                      <span>·</span>
                      <span>{t(statusKey)}</span>
                      <span>·</span>
                      <span>{t('ticker_detail.days_active', { n: th.days_active })}</span>
                      {th.playbook_stage !== 'unknown' && (
                        <>
                          <span>·</span>
                          <span>
                            {t('ticker_detail.stage')} {stageLabel(th.playbook_stage, t)}
                          </span>
                        </>
                      )}
                    </div>
                    {reasoning && (
                      <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                        {reasoning}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {themes.length > 0 && (
          <section className="py-6 border-b border-zinc-100">
            <h2 className="text-base font-semibold mb-3">{t('ticker_detail.theme_timeline')}</h2>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
              <span>{formatDateShort(new Date(timelineMinStart).toISOString(), locale)}</span>
              <span className="text-zinc-500">{t('theme_detail.now_marker')}</span>
              <span>{formatDateShort(new Date(timelineMaxEnd).toISOString(), locale)}</span>
            </div>
            <div className="space-y-2">
              {themes.map((th) => {
                const startTime = new Date(th.first_seen_at).getTime()
                const ceiling = th.typical_duration_days_max ?? 180
                const endTime = startTime + ceiling * 86400000
                const leftPct = ((startTime - timelineMinStart) / timelineSpan) * 100
                const widthPct = ((endTime - startTime) / timelineSpan) * 100
                const nowPct = ((now - timelineMinStart) / timelineSpan) * 100
                const barColor = STAGE_COLORS[th.playbook_stage] ?? 'bg-zinc-300'
                const themeName = pickField(locale, th.name, th.name_zh)
                return (
                  <div key={th.id} className="flex items-center gap-2">
                    <Link
                      href={`/themes/${th.id}`}
                      className="text-xs text-blue-600 hover:underline w-36 truncate shrink-0"
                      title={themeName}
                    >
                      {themeName}
                    </Link>
                    <div className="flex-1 relative h-3 bg-zinc-50 rounded">
                      <div
                        className={`absolute top-0 h-full rounded ${barColor} opacity-70`}
                        style={{ left: `${leftPct}%`, width: `${Math.max(2, widthPct)}%` }}
                        title={`${themeName} · ${th.days_active}d / ~${ceiling}d`}
                      />
                      <div
                        className="absolute top-0 h-full w-0.5 bg-zinc-900"
                        style={{ left: `${Math.min(99, Math.max(0, nowPct))}%` }}
                        title={t('theme_detail.now_marker')}
                      />
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono w-12 text-right shrink-0">
                      {th.days_active}d
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section className="py-6 border-b border-zinc-100">
          <h2 className="text-base font-semibold mb-3">{t('ticker_detail.recent_events')}</h2>
          {recent_events.length === 0 ? (
            <p className="text-sm text-zinc-400">{t('ticker_detail.no_events')}</p>
          ) : (
            <>
              <div className="space-y-3">
                {displayedEvents.map((e) => {
                  const daysAgo = Math.floor(
                    (now - new Date(e.event_date).getTime()) / 86400000
                  )
                  return (
                    <div key={e.id}>
                      {e.source_url ? (
                        <a
                          href={e.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {e.headline}
                        </a>
                      ) : (
                        <p className="text-sm text-zinc-900">{e.headline}</p>
                      )}
                      <p className="text-xs text-zinc-400 mt-0.5 flex flex-wrap gap-1 items-center">
                        <span>{getDisplayPublisher(e.source_name, e.source_url)}</span>
                        <span>·</span>
                        <span>
                          {daysAgo === 0
                            ? t('theme_detail.today')
                            : t('relative_time.days_ago', { n: daysAgo })}
                        </span>
                        {e.theme_id && e.theme_name && (
                          <>
                            <span>·</span>
                            <Link
                              href={`/themes/${e.theme_id}`}
                              className="text-blue-500 hover:underline"
                            >
                              {pickField(locale, e.theme_name, e.theme_name_zh)}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  )
                })}
              </div>
              {recent_events.length > 5 && (
                <button
                  onClick={() => setShowAllEvents((v) => !v)}
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  {showAllEvents
                    ? t('ticker_detail.collapse_events')
                    : t('ticker_detail.view_all_events', { n: recent_events.length })}
                </button>
              )}
            </>
          )}
        </section>

        <section className="py-6">
          <h2 className="text-base font-semibold mb-3">{t('ticker_detail.exit_signals')}</h2>
          {exit_signals.length === 0 ? (
            <p className="text-sm text-zinc-400">{t('ticker_detail.no_exit_signals')}</p>
          ) : (
            <ul className="space-y-2">
              {exit_signals.map((s) => (
                <li key={s.signal} className="text-sm text-zinc-700">
                  <span className="text-amber-600 mr-1">•</span>
                  {s.signal}
                  {s.themes.length > 1 && (
                    <span className="text-xs text-zinc-400 ml-2">
                      ({s.themes.length})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-zinc-400">
            {t('theme_detail.disclaimer_observation')}
          </p>
        </section>
      </main>

      <footer className="border-t border-zinc-200">
        <p className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-zinc-400">
          {t('common.disclaimer_footer')}
        </p>
      </footer>
    </div>
  )
}

function ScoreBox({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'emerald' | 'amber' | 'blue' | 'zinc'
}) {
  const bg = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    zinc: 'bg-zinc-50 border-zinc-200 text-zinc-800',
  }[accent]
  return (
    <div className={`border rounded-lg px-3 py-2 ${bg}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-mono font-semibold mt-0.5">{value.toFixed(1)}</p>
    </div>
  )
}

