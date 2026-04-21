'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import RecommendationTier from '@/components/RecommendationTier'
import CatalystList from '@/components/CatalystList'
import type { ThemeRadarItem } from '@/types/recommendations'
import { formatCategoryLabel } from '@/lib/theme-formatter'

export default function ThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
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
      {/* Top bar */}
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="text-zinc-500 hover:text-zinc-900 text-sm">
            ← 返回
          </Link>
          <span className="text-sm text-zinc-400">Newshock | 信息展示, 非投资建议</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading && <p className="text-zinc-400">Loading...</p>}
        {error && <p className="text-zinc-400">出错了, 稍后重试</p>}

        {theme && (
          <div className="space-y-8">
            {/* Theme header */}
            <div>
              <h1 className="text-3xl font-semibold text-zinc-900 mb-2">{theme.name}</h1>
              <p className="text-sm text-zinc-500 mb-3">
                {formatCategoryLabel(theme.category)} · {theme.days_active} days active · strength {theme.theme_strength_score}
              </p>
              {theme.summary && (
                <p className="text-zinc-700 leading-relaxed">{theme.summary}</p>
              )}
            </div>

            {/* Catalysts */}
            <div>
              <p className="font-semibold text-zinc-800 mb-3">
                ━━ 触发事件 ({theme.catalysts.length} 条) ━━
              </p>
              <CatalystList catalysts={theme.catalysts} />
            </div>

            {/* Recommendations */}
            <div>
              <p className="font-semibold text-zinc-800 mb-4">━━ 推荐股票梯队 ━━</p>
              <RecommendationTier tier={1} recommendations={tier1} />
              <RecommendationTier tier={2} recommendations={tier2} />
              <RecommendationTier tier={3} recommendations={tier3} />
              {theme.recommendations.length === 0 && (
                <p className="text-sm text-zinc-400">暂无推荐股票</p>
              )}
            </div>

            {/* Playbook section */}
            {(theme.archetype_playbook?.historical_cases?.length ?? 0) > 0 && (
              <section className="mt-8 pt-6 border-t">
                <h2 className="text-lg font-semibold mb-2">━━ 历史 Playbook ━━</h2>

                <p className="text-xs text-zinc-500 mb-4">
                  基于 Claude AI 训练数据估算, 非精确市场测量.
                  后续版本将基于实际股价数据校准.
                </p>

                <div className="mb-4 space-y-1">
                  <div className="text-sm">
                    <span className="text-zinc-600">典型持续: </span>
                    <span className="font-medium">
                      {theme.archetype_playbook!.typical_duration_label} (估算)
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-zinc-600">当前进行: </span>
                    <span className="font-medium">第 {theme.days_active} 天</span>
                    {theme.playbook_stage === 'late' && (
                      <span className="text-amber-600 ml-2">(接近典型上限)</span>
                    )}
                    {theme.playbook_stage === 'beyond' && (
                      <span className="text-red-600 ml-2">(超出典型范围)</span>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2">历史可比:</h3>
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

                {(theme.archetype_playbook!.this_time_different?.differences?.length ?? 0) > 0 && (
                  <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-100">
                    <h3 className="text-sm font-semibold mb-3">━━ 这次可能不同? ━━</h3>

                    <div className="mb-3">
                      <div className="text-sm font-medium mb-2">结构性差异:</div>
                      <ul className="space-y-1 text-sm">
                        {theme.archetype_playbook!.this_time_different.differences.map((d, i) => (
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

                    {(theme.archetype_playbook!.this_time_different.similarities?.length ?? 0) > 0 && (
                      <div className="mb-3">
                        <div className="text-sm font-medium mb-2">与历史类似的:</div>
                        <ul className="space-y-1 text-sm">
                          {theme.archetype_playbook!.this_time_different.similarities.map((s, i) => (
                            <li key={i}>
                              = <span className="text-zinc-600">{s.dimension}:</span> {s.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {theme.archetype_playbook!.this_time_different.observation && (
                      <div className="text-sm italic mt-3 text-zinc-700">
                        观察: {theme.archetype_playbook!.this_time_different.observation}
                      </div>
                    )}

                    <div className="text-xs text-zinc-500 mt-3">
                      ⚠️ 以上为观察分析, 非预测或投资建议.
                    </div>
                  </div>
                )}

                {(theme.archetype_playbook!.exit_signals?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">退出信号:</h3>
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

      {/* Footer */}
      <footer className="border-t border-zinc-200 mt-10">
        <p className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-zinc-400">
          信息展示, 非投资建议. 历史表现不代表未来结果.
        </p>
      </footer>
    </div>
  )
}
