'use client'

import { useEffect, useState } from 'react'
import ThemeCard from '@/components/ThemeCard'
import DataFreshnessIndicator from '@/components/DataFreshnessIndicator'
import type { ThemeRadarItem } from '@/types/recommendations'

export default function HomePage() {
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
      {/* Top bar */}
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">Newshock</span>
          <span className="text-sm text-zinc-400">Explore →</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4">
        {/* Subtitle + freshness */}
        <div className="py-4 border-b border-zinc-100 text-center space-y-1">
          <p className="text-sm text-zinc-500">信息展示, 非投资建议</p>
          <p className="text-xs">
            <DataFreshnessIndicator />
          </p>
        </div>

        {/* Theme list */}
        <div className="divide-y divide-zinc-200">
          {loading && (
            <p className="py-10 text-center text-zinc-400">Loading...</p>
          )}
          {error && (
            <p className="py-10 text-center text-zinc-400">出错了, 稍后重试</p>
          )}
          {!loading && !error && themes.length === 0 && (
            <p className="py-10 text-center text-zinc-400">暂无主题数据</p>
          )}
          {themes.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} />
          ))}
        </div>
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
