'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import RecommendationTier from '@/components/RecommendationTier'
import CatalystList from '@/components/CatalystList'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'

export default function ThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [theme, setTheme] = useState<ThemeRadarItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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

            {/* Exposure Mapping (formerly recommendations) */}
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
            {(theme.archetype_playbook?.historical_cases?.length ?? 0) > 0 && (
              <section className="mt-8 pt-6 border-t">
                <h2 className="text-lg font-semibold mb-2">━━ {t('theme_detail.historical_playbook')} ━━</h2>

                <p className="text-xs text-zinc-500 mb-4">
                  {t('theme_detail.disclaimer_playbook')}
                </p>

                <div className="mb-4 space-y-1">
                  <div className="text-sm">
                    <span className="text-zinc-600">{t('theme_detail.typical_duration')}: </span>
                    <span className="font-medium">
                      {theme.archetype_playbook!.typical_duration_label}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-zinc-600">{t('theme_detail.active_for')}: </span>
                    <span className="font-medium">{theme.days_active} {t('theme_detail.days')}</span>
                    {theme.playbook_stage === 'late' && (
                      <span className="text-amber-600 ml-2">{t('theme_detail.near_limit')}</span>
                    )}
                    {theme.playbook_stage === 'beyond' && (
                      <span className="text-red-600 ml-2">{t('theme_detail.beyond_limit')}</span>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2">{t('theme_detail.historical_cases')}:</h3>
                  <ul className="space-y-1 text-sm">
                    {theme.archetype_playbook!.historical_cases.map((c, i) => (
                      <li key={i}>
                        · <span className="font-medium">{c.name}</span>
                        {' · '}{c.approximate_duration}
                        {' · '}{c.peak_move}
                      </li>
                    ))}
                  </ul>
                </div>

                {(() => {
                  const ttd = theme.archetype_playbook!.this_time_different
                  const validDiffs = (ttd?.differences ?? []).filter(
                    (d) => d.dimension && d.description
                  )
                  const validSims = (ttd?.similarities ?? []).filter(
                    (s) => s.dimension && s.description
                  )

                  if (validDiffs.length === 0 && validSims.length === 0 && !ttd?.observation) {
                    return null
                  }

                  return (
                    <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-100">
                      <h3 className="text-sm font-semibold mb-3">━━ {t('theme_detail.this_time_different')} ━━</h3>

                      {validDiffs.length > 0 && (
                        <div className="mb-3">
                          <div className="text-sm font-medium mb-2">{t('theme_detail.structural_differences')}:</div>
                          <ul className="space-y-1 text-sm">
                            {validDiffs.map((d, i) => (
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
                  )
                })()}

                {(theme.archetype_playbook!.exit_signals?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">{t('theme_detail.exit_signals')}:</h3>
                    <ul className="space-y-1 text-sm text-zinc-600">
                      {theme.archetype_playbook!.exit_signals.map((s, i) => (
                        <li key={i}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
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
