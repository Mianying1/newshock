'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'
import { TickerBadge } from '@/components/TickerBadge'
import type { TickerScores } from '@/lib/ticker-scoring'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface RankedResponse {
  tickers: TickerScores[]
  total: number
}

type ThematicTab = '7d' | '30d' | '90d'
type PotentialTab = 'early' | 'mid' | 'all'

function TickerRow({
  ticker,
  rank,
  primaryKey,
}: {
  ticker: TickerScores
  rank: number
  primaryKey: 'thematic' | 'potential'
}) {
  const { t } = useI18n()
  const score =
    primaryKey === 'thematic' ? ticker.thematic_score : ticker.potential_score
  const secondaryLabel =
    primaryKey === 'thematic'
      ? t('tickers_ranked.events_7d', { n: ticker.recent_events_7d })
      : t('tickers_ranked.themes_count', { n: ticker.themes_count })

  return (
    <Link
      href={`/tickers/${ticker.symbol}`}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-b-0"
    >
      <span className="font-mono text-[11px] text-zinc-400 w-6 shrink-0">
        {rank}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <TickerBadge
          symbol={ticker.symbol}
          logoUrl={ticker.logo_url}
          size="sm"
        />
        <span className="text-xs text-zinc-500 truncate">
          {ticker.company_name}
        </span>
      </div>
      <span className="text-[11px] text-zinc-400 shrink-0 hidden sm:inline">
        {secondaryLabel}
      </span>
      <span className="font-mono font-semibold text-sm text-zinc-900 shrink-0 w-10 text-right">
        {score.toFixed(1)}
      </span>
    </Link>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
        active
          ? 'bg-zinc-900 text-white'
          : 'text-zinc-500 hover:text-zinc-900'
      }`}
    >
      {children}
    </button>
  )
}

export function TopTickersSection() {
  const { t } = useI18n()
  const [thematicTab, setThematicTab] = useState<ThematicTab>('7d')
  const [potentialTab, setPotentialTab] = useState<PotentialTab>('all')

  const { data: thematic } = useSWR<RankedResponse>(
    '/api/tickers/ranked?sort=thematic&limit=50',
    fetcher
  )
  const { data: potential } = useSWR<RankedResponse>(
    '/api/tickers/ranked?sort=potential&limit=50',
    fetcher
  )

  const thematicTop = thematic?.tickers.slice(0, 5) ?? []
  const potentialTop = potential?.tickers.slice(0, 5) ?? []
  const thematicTotal = thematic?.total ?? 0
  const potentialTotal = potential?.total ?? 0

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {t('top_tickers.title')}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Thematic card */}
        <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-900">
                  {t('top_tickers.event_driven_hot')}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  {t('tickers_ranked.tab_thematic')}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <TabBtn
                  active={thematicTab === '7d'}
                  onClick={() => setThematicTab('7d')}
                >
                  {t('top_tickers.tab_7d')}
                </TabBtn>
                <TabBtn
                  active={thematicTab === '30d'}
                  onClick={() => setThematicTab('30d')}
                >
                  {t('top_tickers.tab_30d')}
                </TabBtn>
                <TabBtn
                  active={thematicTab === '90d'}
                  onClick={() => setThematicTab('90d')}
                >
                  {t('top_tickers.tab_90d')}
                </TabBtn>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">
              {t('top_tickers.thematic_subtitle')}
            </p>
          </div>
          <div>
            {thematicTop.map((tk, i) => (
              <TickerRow
                key={tk.symbol}
                ticker={tk}
                rank={i + 1}
                primaryKey="thematic"
              />
            ))}
            {thematicTop.length === 0 && (
              <p className="text-xs text-zinc-400 py-6 text-center">
                {t('tickers_ranked.no_data')}
              </p>
            )}
          </div>
          {thematicTotal > 5 && (
            <Link
              href="/tickers?tab=thematic"
              className="block px-4 py-2.5 text-[11px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border-t border-zinc-100 transition-colors text-center"
            >
              {t('top_tickers.show_all_thematic', { n: thematicTotal })}
            </Link>
          )}
        </div>

        {/* Potential card */}
        <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-900">
                  {t('top_tickers.structural_early')}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {t('tickers_ranked.tab_potential')}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <TabBtn
                  active={potentialTab === 'early'}
                  onClick={() => setPotentialTab('early')}
                >
                  {t('top_tickers.tab_early')}
                </TabBtn>
                <TabBtn
                  active={potentialTab === 'mid'}
                  onClick={() => setPotentialTab('mid')}
                >
                  {t('top_tickers.tab_mid')}
                </TabBtn>
                <TabBtn
                  active={potentialTab === 'all'}
                  onClick={() => setPotentialTab('all')}
                >
                  {t('top_tickers.tab_all')}
                </TabBtn>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">
              {t('top_tickers.potential_subtitle')}
            </p>
          </div>
          <div>
            {potentialTop.map((tk, i) => (
              <TickerRow
                key={tk.symbol}
                ticker={tk}
                rank={i + 1}
                primaryKey="potential"
              />
            ))}
            {potentialTop.length === 0 && (
              <p className="text-xs text-zinc-400 py-6 text-center">
                {t('tickers_ranked.no_data')}
              </p>
            )}
          </div>
          {potentialTotal > 5 && (
            <Link
              href="/tickers?tab=potential"
              className="block px-4 py-2.5 text-[11px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border-t border-zinc-100 transition-colors text-center"
            >
              {t('top_tickers.show_all_potential', { n: potentialTotal })}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
