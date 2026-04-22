'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RankedTickerCard from '@/components/RankedTickerCard'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useI18n } from '@/lib/i18n-context'
import { formatMinutesAgo } from '@/lib/utils'
import type { TickerScores } from '@/lib/ticker-scoring'

type SortKey = 'thematic' | 'potential'

interface RankedResponse {
  tickers: TickerScores[]
  total: number
  sort: SortKey
  limit: number
  updated_at: string
}

const TABS: { key: SortKey; icon: string; tabKey: string }[] = [
  { key: 'thematic', icon: '🎯', tabKey: 'tab_thematic' },
  { key: 'potential', icon: '🌱', tabKey: 'tab_potential' },
]

const HEADING_KEY: Record<SortKey, string> = {
  thematic: 'thematic_leaders',
  potential: 'potential_leaders',
}

const DESC_KEY: Record<SortKey, string> = {
  thematic: 'desc_thematic',
  potential: 'desc_potential',
}

const MIN_POTENTIAL_DISPLAY = 5

const SECTOR_KEY: Record<string, string> = {
  'Geopolitics': 'sector_geopolitics',
  'geopolitics': 'sector_geopolitics',
  'geopolitical': 'sector_geopolitics',
  'AI / 半导体': 'sector_ai_semi',
  'AI / Semi': 'sector_ai_semi',
  'ai_semi': 'sector_ai_semi',
  'supply_chain': 'sector_supply_chain',
  'Macro / Monetary': 'sector_macro',
  'macro_monetary': 'sector_macro',
  'Pharma': 'sector_pharma',
  'pharma': 'sector_pharma',
  'Energy': 'sector_energy',
  'energy': 'sector_energy',
  'Materials': 'sector_materials',
  'materials': 'sector_materials',
  'auto': 'sector_auto',
  'fintech': 'sector_fintech',
  'semiconductors': 'sector_semiconductors',
}

function sectorKeyFor(category: string | null | undefined): string {
  if (!category) return 'sector_other'
  return SECTOR_KEY[category] ?? 'sector_other'
}

export default function TickersPage() {
  const { t } = useI18n()
  const [sort, setSort] = useState<SortKey>('thematic')
  const [data, setData] = useState<RankedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [potentialPoor, setPotentialPoor] = useState<RankedResponse | null>(null)
  const [showMore, setShowMore] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch(`/api/tickers/ranked?sort=${sort}&limit=50`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
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
  }, [sort])

  useEffect(() => {
    setShowMore({})
  }, [sort])

  useEffect(() => {
    if (sort !== 'potential' || !data) return
    if (data.tickers.length >= MIN_POTENTIAL_DISPLAY) {
      setPotentialPoor(null)
      return
    }
    setPotentialPoor(data)
  }, [sort, data])

  const updatedLabel = data
    ? formatMinutesAgo(
        Math.max(0, Math.floor((Date.now() - new Date(data.updated_at).getTime()) / 60000)),
        t
      )
    : ''

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
          {data && (
            <p className="text-xs text-zinc-400 mt-1">
              {t('tickers_ranked.updated', { time: updatedLabel })}
            </p>
          )}
        </div>

        <div className="flex gap-1 border-b border-zinc-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSort(tab.key)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition ${
                sort === tab.key
                  ? 'border-zinc-900 text-zinc-900 font-medium'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {t(`tickers_ranked.${tab.tabKey}`)}
            </button>
          ))}
        </div>

        <div className="py-3">
          <h2 className="text-base font-semibold">{t(`tickers_ranked.${HEADING_KEY[sort]}`)}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{t(`tickers_ranked.${DESC_KEY[sort]}`)}</p>
        </div>

        <div className="space-y-2">
          {loading && <p className="py-10 text-center text-zinc-400">{t('tickers_ranked.loading')}</p>}
          {error && <p className="py-10 text-center text-zinc-400">{t('common.error')}</p>}
          {!loading && !error && sort === 'thematic' && data && data.tickers.length > 0 && (
            <GroupedThematicList
              tickers={data.tickers}
              showMore={showMore}
              onToggle={(key) => setShowMore((prev) => ({ ...prev, [key]: true }))}
            />
          )}
          {!loading && !error && sort === 'potential' && data?.tickers.map((ticker, idx) => (
            <RankedTickerCard
              key={ticker.symbol}
              ticker={ticker}
              rank={idx + 1}
              primaryKey={sort}
            />
          ))}
          {!loading && !error && sort === 'potential' && potentialPoor && (
            <PotentialEmptyState existing={potentialPoor.tickers.length} />
          )}
          {!loading && !error && sort === 'thematic' && data?.tickers.length === 0 && (
            <p className="py-10 text-center text-zinc-400">{t('tickers_ranked.no_data')}</p>
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

function GroupedThematicList({
  tickers,
  showMore,
  onToggle,
}: {
  tickers: TickerScores[]
  showMore: Record<string, boolean>
  onToggle: (key: string) => void
}) {
  const { t } = useI18n()

  const groups = new Map<string, TickerScores[]>()
  for (const ticker of tickers) {
    const key = sectorKeyFor(ticker.dominant_category)
    const existing = groups.get(key)
    if (existing) existing.push(ticker)
    else groups.set(key, [ticker])
  }

  const ordered = Array.from(groups.entries())
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.thematic_score - a.thematic_score)
      return { key, list: sorted, top: sorted[0]?.thematic_score ?? 0 }
    })
    .sort((a, b) => b.top - a.top)

  let rank = 0
  return (
    <>
      {ordered.map(({ key, list }) => {
        const expanded = showMore[key] ?? false
        const visible = expanded ? list : list.slice(0, 5)
        const hidden = list.length - visible.length
        const startRank = rank
        rank += list.length
        return (
          <div key={key} className="pt-2">
            <h3 className="text-sm font-medium mb-2 mt-4 first:mt-0 flex items-baseline gap-2">
              <span>{t(`tickers_ranked.${key}`)}</span>
              <span className="text-xs font-normal text-zinc-500">
                {list.length} {t('tickers_ranked.tickers_unit')}
              </span>
            </h3>
            <div className="space-y-2">
              {visible.map((ticker, i) => (
                <RankedTickerCard
                  key={ticker.symbol}
                  ticker={ticker}
                  rank={startRank + i + 1}
                  primaryKey="thematic"
                />
              ))}
            </div>
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => onToggle(key)}
                className="text-sm text-blue-600 hover:underline mt-2"
              >
                {t('tickers_ranked.show_more', { n: hidden })}
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}

interface RecentArchetype {
  id: string
  name: string
  category: string | null
  created_at: string
}

function PotentialEmptyState({ existing }: { existing: number }) {
  const { t } = useI18n()
  const [archs, setArchs] = useState<RecentArchetype[]>([])

  useEffect(() => {
    fetch('/api/archetypes/recent')
      .then((r) => (r.ok ? r.json() : { archetypes: [] }))
      .then((d) => setArchs(d.archetypes ?? []))
      .catch(() => setArchs([]))
  }, [])

  const nextScanDate = (() => {
    const now = new Date()
    const day = now.getDay()
    const daysUntilMonday = (8 - day) % 7 || 7
    const next = new Date(now.getTime() + daysUntilMonday * 86400000)
    return next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })()

  return (
    <div className="border border-zinc-200 rounded-lg p-4 mt-4 bg-zinc-50">
      {existing === 0 && (
        <p className="text-sm text-zinc-700 mb-3">{t('tickers_ranked.no_potential_title')}</p>
      )}
      {archs.length > 0 && (
        <>
          <p className="text-xs text-zinc-500 mb-2">{t('tickers_ranked.no_potential_hint')}</p>
          <ul className="space-y-1">
            {archs.slice(0, 5).map((a) => (
              <li key={a.id} className="text-sm text-zinc-700">
                <span className="text-zinc-400 mr-1">·</span>
                {a.name}
                {a.category && (
                  <span className="text-xs text-zinc-400 ml-2">{t(`categories.${a.category}`)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-zinc-400 mt-3">
        {t('tickers_ranked.no_potential_next', { date: nextScanDate })}
      </p>
    </div>
  )
}
