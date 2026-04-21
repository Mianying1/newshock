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
