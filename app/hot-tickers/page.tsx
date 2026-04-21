'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import HotTickerCard from '@/components/HotTickerCard'

interface HotTickersData {
  total_hot_tickers: number
  tickers: {
    ticker_symbol: string
    company_name: string
    sector: string | null
    themes: { id: string; name: string; tier: number; role_reasoning: string; theme_strength: number }[]
    tier_distribution: Record<number, number>
  }[]
}

export default function HotTickersPage() {
  const [data, setData] = useState<HotTickersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/hot-tickers')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">Newshock</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-zinc-900">主题</Link>
            <span className="text-zinc-900 font-medium">热点股票</span>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4">
        <div className="py-4 border-b border-zinc-100 text-center">
          <p className="text-sm text-zinc-500">
            被多个主题同时推荐的股票
            {data && ` · 共 ${data.total_hot_tickers} 只`}
          </p>
        </div>

        <div className="divide-y divide-zinc-200">
          {loading && <p className="py-10 text-center text-zinc-400">Loading...</p>}
          {error && <p className="py-10 text-center text-zinc-400">出错了, 稍后重试</p>}
          {data?.tickers.map((t) => (
            <HotTickerCard key={t.ticker_symbol} ticker={t} />
          ))}
          {!loading && !error && data?.tickers.length === 0 && (
            <p className="py-10 text-center text-zinc-400">暂无高频股票</p>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-200 mt-10">
        <p className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-zinc-400">
          信息展示, 非投资建议. 历史表现不代表未来结果.
        </p>
      </footer>
    </div>
  )
}
