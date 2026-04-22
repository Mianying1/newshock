'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import RecommendationTier from '@/components/RecommendationTier'
import CatalystList from '@/components/CatalystList'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'
import { STAGE_COLORS } from '@/lib/utils'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'

export default function ThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [theme, setTheme] = useState<ThemeRadarItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showAllDiffs, setShowAllDiffs] = useState(false)

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

  const tier1 = theme?.recommendations.filter((r) => r.tier === 1) ?? []
  const tier2 = theme?.recommendations.filter((r) => r.tier === 2) ?? []
  const tier3 = theme?.recommendations.filter((r) => r.tier === 3) ?? []

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
              <h1 className="text-3xl font-semibold text-zinc-900 mb-2">{theme.name}</h1>
              <p className="text-sm text-zinc-500 mb-3">
                {formatCategoryLabel(theme.category)} · {theme.days_active} {t('theme_detail.days')} · strength {theme.theme_strength_score}
              </p>
              {theme.summary && (
                <p className="text-zinc-700 leading-relaxed">{theme.summary}</p>
              )}
            </div>

            {/* Catalysts */}
            <div>
              <p className="font-semibold text-zinc-800 mb-3">
                ━━ {t('theme_detail.trigger_events')} ({theme.catalysts.length}) ━━
              </p>
              <CatalystList catalysts={theme.catalysts} />
            </div>

            {/* Exposure Mapping */}
            <div>
              <p className="font-semibold text-zinc-800 mb-4">━━ {t('theme_detail.exposure_mapping')} ━━</p>
              <RecommendationTier tier={1} recommendations={tier1} />
              <RecommendationTier tier={2} recommendations={tier2} />
              <RecommendationTier tier={3} recommendations={tier3} />
              {theme.recommendations.length === 0 && (
                <p className="text-sm text-zinc-400">{t('theme_detail.no_exposure')}</p>
              )}
            </div>

            {/* Playbook section */}
            {(theme.archetype_playbook?.historical_cases?.length ?? 0) > 0 && (() => {
              const pb = theme.archetype_playbook!
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

                  {/* Timeline — 3 modes by duration_type */}
                  {(() => {
                    const dtype = pb.duration_type ?? 'bounded'
                    const rwt = pb.real_world_timeline

                    if (dtype === 'bounded') {
                      return (
                        <div className="mt-3 mb-6">
                          <div className="flex justify-between text-xs text-zinc-500 mb-1">
                            <span>0 {t('theme_detail.days')}</span>
                            <span>{hotProgressPercent}% {t('theme_detail.elapsed')}</span>
                            <span>{daysMax} {t('theme_detail.days')} ({t('theme_detail.typical_ceiling')})</span>
                          </div>
                          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                            <div className={`h-full ${stageColor} transition-all`} style={{ width: `${hotProgressPercent}%` }} />
                          </div>
                          {t(stageDescKey) && (
                            <p className="text-xs mt-2 text-zinc-600">{t(stageDescKey)}</p>
                          )}
                          <div className="mt-3 space-y-1 text-sm">
                            <div>
                              <span className="text-zinc-600">{t('theme_detail.typical_duration')}: </span>
                              <span className="font-medium">{pb.typical_duration_label}</span>
                            </div>
                            <div>
                              <span className="text-zinc-600">{t('theme_detail.active_for')}: </span>
                              <span className="font-medium">{theme.days_hot} {t('theme_detail.days')}</span>
                              {theme.playbook_stage === 'late' && <span className="text-amber-600 ml-2">{t('theme_detail.near_limit')}</span>}
                              {theme.playbook_stage === 'beyond' && <span className="text-red-600 ml-2">{t('theme_detail.beyond_limit')}</span>}
                            </div>
                          </div>
                          {isCooling && (
                            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                              <div className="font-medium text-amber-900 mb-1">
                                Hot phase frozen at {theme.days_hot} days
                              </div>
                              <div className="text-amber-700 text-xs mb-2">
                                Last event: {theme.days_since_last_event} days ago.{' '}
                                Archive in {Math.max(0, 60 - theme.days_since_last_event)} days if no new events.
                              </div>
                              <div className="flex justify-between text-[10px] text-amber-600 mb-0.5">
                                <span>Cooling</span>
                                <span>{theme.days_since_last_event}d / 60d</span>
                              </div>
                              <div className="h-1 bg-amber-100 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 transition-all" style={{ width: `${coolProgressPercent}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    }

                    if (dtype === 'extended') {
                      const maturityLabel: Record<string, string> = {
                        early: t('theme_card.stage_early'),
                        mid: t('theme_card.stage_mid'),
                        late: t('theme_card.stage_late'),
                        beyond_typical: t('theme_card.stage_beyond'),
                      }
                      return (
                        <div className="mt-3 mb-6 p-3 bg-zinc-50 rounded border border-zinc-200 text-sm space-y-2">
                          <div className="font-medium text-zinc-700">━━ {t('timeline.heading')} ━━</div>
                          <div>
                            <span className="text-zinc-500">⏱ {t('timeline.tracked')}: </span>
                            <span className="font-medium">{theme.days_active} {t('theme_detail.days')}</span>
                            <span className="text-zinc-400 ml-1">({t('timeline.since')} {theme.first_seen_at?.slice(0, 10)})</span>
                          </div>
                          {rwt && (
                            <>
                              <div>
                                <span className="text-zinc-500">⏳ {t('timeline.real_world')}: </span>
                                <span className="font-medium">~{rwt.approximate_start}</span>
                                {rwt.description && (
                                  <span className="text-zinc-500 ml-1">· {rwt.description}</span>
                                )}
                              </div>
                              <div>
                                <span className="text-zinc-500">📊 {t('timeline.maturity')}: </span>
                                <span className="font-medium">{maturityLabel[rwt.current_maturity_estimate] ?? rwt.current_maturity_estimate}</span>
                                <span className="text-zinc-400 ml-2 text-xs">(based on real-world timeline)</span>
                              </div>
                            </>
                          )}
                          <p className="text-xs text-zinc-400 italic">{t('timeline.extended_note')}</p>
                        </div>
                      )
                    }

                    // dependent
                    return (
                      <div className="mt-3 mb-6 p-3 bg-amber-50 rounded border border-amber-100 text-sm space-y-2">
                        <div className="font-medium text-zinc-700">━━ {t('timeline.heading')} ━━</div>
                        <div>
                          <span className="text-zinc-500">⏱ {t('timeline.this_cycle')}: </span>
                          <span className="font-medium">{theme.days_active} {t('theme_detail.days')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-600">🔗</span>
                          <span className="font-medium text-amber-700">{t('duration_type.dependent')}</span>
                        </div>
                        <p className="text-xs text-amber-700">{t('timeline.dependent_note')}</p>
                        {pb.duration_type_reasoning && (
                          <p className="text-xs text-zinc-500 italic">{pb.duration_type_reasoning}</p>
                        )}
                      </div>
                    )
                  })()}

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
                          <div className="text-sm font-medium mb-2">{t('theme_detail.structural_differences')}:</div>
                          <ul className="space-y-1 text-sm">
                            {visibleDiffs.map((d, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="flex-shrink-0">
                                  {d.direction === 'may_extend' ? '↑' : d.direction === 'may_shorten' ? '↓' : '?'}
                                </span>
                                <span>
                                  <span className="text-zinc-600">{d.dimension}:</span> {d.description}
                                  <span className="text-xs text-zinc-500 ml-1">[{d.confidence}]</span>
                                </span>
                              </li>
                            ))}
                          </ul>
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
