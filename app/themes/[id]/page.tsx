'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { RecommendationGroup } from '@/components/RecommendationGroup'
import CatalystList from '@/components/CatalystList'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { STAGE_COLORS } from '@/lib/utils'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'

export default function ThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, locale } = useI18n()
  const [theme, setTheme] = useState<ThemeRadarItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showAllDiffs, setShowAllDiffs] = useState(false)
  const [showAllEvents, setShowAllEvents] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/themes/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((data) => {
        setTheme(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [id])

  const recs = theme?.recommendations ?? []
  const directRecs = recs.filter((r) => r.exposure_type === 'direct')
  const observationalRecs = recs.filter((r) => r.exposure_type === 'observational')
  const pressureRecs = recs.filter((r) => r.exposure_type === 'pressure')
  const unclassified = recs.filter((r) => !r.exposure_type && r.exposure_direction !== 'headwind')
  const headwinds = recs.filter((r) => !r.exposure_type && r.exposure_direction === 'headwind')

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-zinc-500 hover:text-zinc-900 text-sm">
            {t('theme_detail.back')}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">Newshock | {t('homepage.subtitle')}</span>
            <LocaleToggle />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading && <p className="text-zinc-400">{t('theme_detail.loading')}</p>}
        {error && <p className="text-zinc-400">{t('theme_detail.error')}</p>}

        {theme && (
          <div className="space-y-8">
            {/* Theme header */}
            <div>
              <h1 className="text-3xl font-semibold text-zinc-900 mb-2">
                {pickField(locale, theme.name, theme.name_zh)}
              </h1>
              <p className="text-sm text-zinc-500 mb-3">
                {formatCategoryLabel(theme.category)} · {theme.days_active} {t('theme_detail.days')} · strength {theme.theme_strength_score}
              </p>
              {(() => {
                const summary = pickField(locale, theme.summary, theme.summary_zh)
                return summary ? (
                  <p className="text-zinc-700 leading-relaxed">{summary}</p>
                ) : null
              })()}
            </div>

            {/* Catalysts */}
            <div>
              <p className="font-semibold text-zinc-800 mb-3">
                ━━ {t('theme_detail.trigger_events')} ({theme.catalysts.length}) ━━
              </p>
              <CatalystList
                catalysts={showAllEvents ? theme.catalysts : theme.catalysts.slice(0, 5)}
              />
              {theme.catalysts.length > 5 && (
                <button
                  onClick={() => setShowAllEvents((v) => !v)}
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  {showAllEvents
                    ? t('theme_detail.collapse_events')
                    : t('theme_detail.view_all_events', { n: theme.catalysts.length })}
                </button>
              )}
            </div>

            {/* Exposure Mapping */}
            <div>
              <p className="font-semibold text-zinc-800 mb-3">━━ {t('theme_detail.exposure_mapping')} ━━</p>

              <RecommendationGroup
                title={t('theme_detail.direct_exposure')}
                items={directRecs}
              />
              <RecommendationGroup
                title={t('theme_detail.observational_mapping')}
                items={observationalRecs}
              />
              <RecommendationGroup
                title={t('theme_detail.pressure_assets')}
                items={pressureRecs}
                variant="pressure"
              />
              <RecommendationGroup
                title={t('theme_detail.diversified_beneficiaries')}
                items={unclassified}
              />
              <RecommendationGroup
                title={t('theme_detail.headwinds')}
                items={headwinds}
                variant="headwind"
              />
              {theme.recommendations.length === 0 && (
                <p className="text-sm text-zinc-400">{t('theme_detail.no_exposure')}</p>
              )}
            </div>

            {/* Playbook section */}
            {(theme.archetype_playbook?.historical_cases?.length ?? 0) > 0 && (() => {
              const pb =
                (locale === 'zh' && theme.archetype_playbook_zh?.historical_cases?.length
                  ? theme.archetype_playbook_zh
                  : theme.archetype_playbook) as NonNullable<typeof theme.archetype_playbook>
              const daysMax = pb.typical_duration_days_approx?.[1] || 90
              const hotProgressPercent = Math.min(100, Math.round((theme.days_hot / daysMax) * 100))
              const isCooling = theme.status === 'cooling'
              const coolProgressPercent = Math.min(100, Math.max(0,
                Math.round(((theme.days_since_last_event - 30) / 30) * 100)
              ))
              const stageColor = STAGE_COLORS[theme.playbook_stage] ?? 'bg-zinc-300'
              const stageDescKey = `theme_detail.stage_desc_${theme.playbook_stage}`

              const ttd = pb.this_time_different
              const allValidDiffs = (ttd?.differences ?? []).filter(
                (d) => d.dimension && d.description
              )
              const highConfDiffs = allValidDiffs.filter((d) => d.confidence === 'high')
              const visibleDiffs = showAllDiffs ? allValidDiffs : highConfDiffs
              const hiddenCount = allValidDiffs.length - highConfDiffs.length

              const validSims = (ttd?.similarities ?? []).filter(
                (s) => typeof s === 'object' && s !== null && (s as { dimension?: string }).dimension && (s as { description?: string }).description
              ) as { dimension: string; description: string }[]

              return (
                <section className="mt-8 pt-6 border-t">
                  <h2 className="text-lg font-semibold mb-2">━━ {t('theme_detail.historical_playbook')} ━━</h2>

                  <p className="text-xs text-zinc-500 mb-3">
                    {t('theme_detail.disclaimer_playbook')}
                  </p>

                  {/* Timeline — unified visual bar across bounded/extended/dependent */}
                  {(() => {
                    const dtype = pb.duration_type ?? 'bounded'
                    const rwt = pb.real_world_timeline
                    const maturityLabel: Record<string, string> = {
                      early: t('theme_card.stage_early'),
                      mid: t('theme_card.stage_mid'),
                      late: t('theme_card.stage_late'),
                      beyond: t('theme_card.stage_beyond'),
                      beyond_typical: t('theme_card.stage_beyond'),
                      unknown: '',
                    }
                    const startLabel =
                      rwt?.approximate_start ??
                      (theme.first_seen_at ? theme.first_seen_at.slice(0, 10) : 'Start')
                    const expectedDays = daysMax > 0 ? daysMax : 0
                    const progressPercent = expectedDays > 0
                      ? Math.min(100, Math.round((theme.days_hot / expectedDays) * 100))
                      : 20
                    const modeNote =
                      dtype === 'extended'
                        ? t('timeline.extended_note')
                        : dtype === 'dependent'
                          ? t('timeline.dependent_note')
                          : t(stageDescKey)
                    const stageText = maturityLabel[theme.playbook_stage] ?? ''

                    return (
                      <div className="border border-zinc-200 rounded-lg p-4 my-6">
                        <h3 className="text-sm font-medium mb-3">
                          {t('theme_detail.theme_timeline')}
                        </h3>

                        <div className="flex justify-between text-xs text-zinc-500 mb-2">
                          <span>{startLabel}</span>
                          <span>{t('theme_detail.expected_end')}</span>
                        </div>

                        <div className="relative h-2 bg-zinc-100 rounded-full">
                          <div
                            className={`absolute top-0 left-0 h-full ${stageColor} rounded-full transition-all`}
                            style={{ width: `${progressPercent}%` }}
                          />
                          <div
                            className="absolute -top-1 w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-full shadow"
                            style={{ left: `calc(${progressPercent}% - 7px)` }}
                            title={t('theme_detail.now_marker')}
                          />
                        </div>

                        <div className="flex justify-between text-xs mt-3">
                          <span className="text-zinc-600">
                            {t('theme_card.stage_prefix')}:{' '}
                            <strong className="text-zinc-900">{stageText}</strong>
                          </span>
                          <span className="text-zinc-500">
                            {theme.days_hot} / {expectedDays > 0 ? `~${expectedDays}` : '?'} {t('theme_detail.days')}
                          </span>
                        </div>

                        {modeNote && (
                          <p className="text-xs text-zinc-500 italic mt-2">{modeNote}</p>
                        )}

                        {isCooling && (
                          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                            <div className="font-medium text-amber-900 mb-1">
                              {t('theme_detail.cooling_banner_title', { n: theme.days_hot })}
                            </div>
                            <div className="text-amber-700 text-xs mb-2">
                              {t('theme_detail.cooling_archive_hint', {
                                n: theme.days_since_last_event,
                                m: Math.max(0, 60 - theme.days_since_last_event),
                              })}
                            </div>
                            <div className="flex justify-between text-[10px] text-amber-600 mb-0.5">
                              <span>{t('theme_detail.cooling_label')}</span>
                              <span>{theme.days_since_last_event}d / 60d</span>
                            </div>
                            <div className="h-1 bg-amber-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 transition-all" style={{ width: `${coolProgressPercent}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <p className="text-[11px] text-zinc-400 italic mb-3">
                    ℹ {t('theme_detail.ai_source_hint')}
                  </p>

                  <div className="mb-6">
                    <h3 className="text-sm font-medium mb-2">{t('theme_detail.historical_cases')}:</h3>
                    <ul className="space-y-1 text-sm">
                      {pb.historical_cases.map((c, i) => (
                        <li key={i}>
                          · <span className="font-medium">{c.name}</span>
                          {' · '}{c.approximate_duration}
                          {' · '}{c.peak_move}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {(visibleDiffs.length > 0 || validSims.length > 0 || ttd?.observation) && (
                    <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-100">
                      <h3 className="text-sm font-semibold mb-3">━━ {t('theme_detail.this_time_different')} ━━</h3>

                      {visibleDiffs.length > 0 && (
                        <div className="mb-3">
                          <div className="text-sm font-medium mb-2">{t('theme_detail.structural_differences')}</div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {visibleDiffs.map((d, i) => {
                              const arrow =
                                d.direction === 'may_extend' ? '↑'
                                : d.direction === 'may_shorten' ? '↓'
                                : '⇅'
                              const arrowColor =
                                d.direction === 'may_extend' ? 'text-emerald-600'
                                : d.direction === 'may_shorten' ? 'text-rose-600'
                                : 'text-zinc-500'
                              const confClass =
                                d.confidence === 'high'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              return (
                                <div key={i} className="border border-zinc-200 bg-white rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-base ${arrowColor}`}>{arrow}</span>
                                      <span className="text-sm font-medium capitalize">
                                        {d.dimension.replace(/_/g, ' ')}
                                      </span>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${confClass}`}>
                                      {d.confidence}
                                    </span>
                                  </div>
                                  <p className="text-xs text-zinc-600 leading-relaxed">
                                    {d.description}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                          {!showAllDiffs && hiddenCount > 0 && (
                            <button
                              onClick={() => setShowAllDiffs(true)}
                              className="text-xs text-zinc-500 hover:text-zinc-900 mt-2 underline-offset-2 hover:underline"
                            >
                              {t('theme_detail.show_all_diffs')} ({hiddenCount} {t('theme_detail.more_medium_conf')})
                            </button>
                          )}
                        </div>
                      )}

                      {validSims.length > 0 && (
                        <div className="mb-3">
                          <div className="text-sm font-medium mb-2">{t('theme_detail.similarities')}:</div>
                          <ul className="space-y-1 text-sm">
                            {validSims.map((s, i) => (
                              <li key={i}>
                                = <span className="text-zinc-600">{s.dimension}:</span> {s.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {ttd?.observation && (
                        <div className="text-sm italic mt-3 text-zinc-700">
                          {t('theme_detail.observation')}: {ttd.observation}
                        </div>
                      )}

                      <div className="text-xs text-zinc-500 mt-3">
                        ⚠️ {t('theme_detail.disclaimer_observation')}
                      </div>
                    </div>
                  )}

                  {(pb.exit_signals?.length ?? 0) > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">{t('theme_detail.exit_signals')}:</h3>
                      <ul className="space-y-1 text-sm text-zinc-600">
                        {pb.exit_signals.map((s, i) => (
                          <li key={i}>· {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )
            })()}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 mt-10">
        <p className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-zinc-400">
          {t('common.disclaimer_footer')}
        </p>
      </footer>
    </div>
  )
}
