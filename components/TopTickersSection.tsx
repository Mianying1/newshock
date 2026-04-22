'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'
import type { TickerScores } from '@/lib/ticker-scoring'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface RankedResponse {
  tickers: TickerScores[]
  total: number
}

type ThematicTab = '7d' | '30d' | '90d'
type PotentialTab = 'early' | 'mid' | 'all'

function RankRow({
  ticker,
  rank,
  primaryKey,
}: {
  ticker: TickerScores
  rank: number
  primaryKey: 'thematic' | 'potential'
}) {
  const score =
    primaryKey === 'thematic' ? ticker.thematic_score : ticker.potential_score
  const right = primaryKey === 'thematic'
    ? { n: ticker.themes_count, unit: 'thm' }
    : { n: ticker.themes_count, unit: 'thm' }

  return (
    <Link href={`/tickers/${ticker.symbol}`} className="rank-row">
      <div className="n">{rank}</div>
      <div>
        <div className="sym">{ticker.symbol}</div>
        <div className="nm">{ticker.company_name}</div>
      </div>
      <div className="sc">
        {score.toFixed(1)}
        <small>/10</small>
      </div>
      <div className="sc" style={{ color: 'var(--ink-3)' }}>
        {right.n}
        <small>{right.unit}</small>
      </div>
      <div className="more">›</div>
    </Link>
  )
}

export function TopTickersSection() {
  const { t } = useI18n()
  const [thematicTab, setThematicTab] = useState<ThematicTab>('7d')
  const [potentialTab, setPotentialTab] = useState<PotentialTab>('early')

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
    <>
      <div className="sec-label">
        <span className="l">{t('top_tickers.title')}</span>
        <span className="r">{t('market_regime.scores_refresh_twice_weekly')}</span>
      </div>

      <div className="ranks">
        {/* Thematic card */}
        <div className="rank-card">
          <div className="rank-head">
            <div>
              <div className="rank-title">{t('tickers_ranked.thematic_leaders')}</div>
              <div className="rank-sub">{t('top_tickers.thematic_subtitle')}</div>
            </div>
            <div className="rank-tabs">
              <button
                className={thematicTab === '7d' ? 'on' : ''}
                onClick={() => setThematicTab('7d')}
              >
                7d
              </button>
              <button
                className={thematicTab === '30d' ? 'on' : ''}
                onClick={() => setThematicTab('30d')}
              >
                30d
              </button>
              <button
                className={thematicTab === '90d' ? 'on' : ''}
                onClick={() => setThematicTab('90d')}
              >
                90d
              </button>
            </div>
          </div>
          <div>
            {thematicTop.map((tk, i) => (
              <RankRow
                key={tk.symbol}
                ticker={tk}
                rank={i + 1}
                primaryKey="thematic"
              />
            ))}
            {thematicTop.length === 0 && (
              <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
                {t('tickers_ranked.no_data')}
              </p>
            )}
          </div>
          {thematicTotal > 5 && (
            <Link href="/tickers?tab=thematic" className="rank-foot">
              {t('top_tickers.show_all_thematic', { n: thematicTotal })}
            </Link>
          )}
        </div>

        {/* Potential card */}
        <div className="rank-card">
          <div className="rank-head">
            <div>
              <div className="rank-title">{t('tickers_ranked.potential_leaders')}</div>
              <div className="rank-sub">{t('top_tickers.potential_subtitle')}</div>
            </div>
            <div className="rank-tabs">
              <button
                className={potentialTab === 'early' ? 'on' : ''}
                onClick={() => setPotentialTab('early')}
              >
                {t('top_tickers.tab_early')}
              </button>
              <button
                className={potentialTab === 'mid' ? 'on' : ''}
                onClick={() => setPotentialTab('mid')}
              >
                {t('top_tickers.tab_mid')}
              </button>
              <button
                className={potentialTab === 'all' ? 'on' : ''}
                onClick={() => setPotentialTab('all')}
              >
                {t('top_tickers.tab_all')}
              </button>
            </div>
          </div>
          <div>
            {potentialTop.map((tk, i) => (
              <RankRow
                key={tk.symbol}
                ticker={tk}
                rank={i + 1}
                primaryKey="potential"
              />
            ))}
            {potentialTop.length === 0 && (
              <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
                {t('tickers_ranked.no_data')}
              </p>
            )}
          </div>
          {potentialTotal > 5 && (
            <Link href="/tickers?tab=potential" className="rank-foot">
              {t('top_tickers.show_all_potential', { n: potentialTotal })}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
