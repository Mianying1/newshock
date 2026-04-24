'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'
import TickerRow, { type TickerRowBadge, NewspaperIcon, BotIcon } from '@/components/TickerRow'
import type { LongShortTickerRow, AngleDirectionRow, LongShortMode } from '@/lib/ticker-scoring'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LongShortResponse {
  mode: LongShortMode
  tickers: LongShortTickerRow[]
  total: number
}

interface AnglesResponse {
  directions: AngleDirectionRow[]
  total: number
}

export function TopTickersSection() {
  const { t } = useI18n()
  const [mode, setMode] = useState<LongShortMode>('long')

  const { data: tickers, isLoading: tickersLoading } = useSWR<LongShortResponse>(
    `/api/tickers/long-short?mode=${mode}&limit=50`,
    fetcher
  )
  const { data: angles, isLoading: anglesLoading } = useSWR<AnglesResponse>(
    `/api/new-angle-candidates?limit=50`,
    fetcher
  )

  const tickerTop = tickers?.tickers.slice(0, 5) ?? []
  const tickerTotal = tickers?.total ?? 0
  const angleTop = angles?.directions?.slice(0, 5) ?? []
  const angleTotal = angles?.total ?? 0

  return (
    <>
      <div className="sec-label">
        <span className="l">{t('top_tickers.title')}</span>
        <span className="r">{t('market_regime.scores_refresh_twice_weekly')}</span>
      </div>

      <div className="ranks">
        {/* Thematic (Long/Short) card */}
        <div className="rank-card">
          <div className="rank-head">
            <div>
              <div className="rank-title">{t('top_tickers.thematic_title')}</div>
              <div className="rank-sub">{t('top_tickers.thematic_subtitle')}</div>
            </div>
            <div className="rank-tabs">
              <button
                className={mode === 'long' ? 'on' : ''}
                onClick={() => setMode('long')}
              >
                {t('tickers_ranked.subtab_long')}
              </button>
              <button
                className={mode === 'short' ? 'on' : ''}
                onClick={() => setMode('short')}
              >
                {t('tickers_ranked.subtab_short')}
              </button>
            </div>
          </div>
          <div>
            {tickersLoading && tickerTop.length === 0 ? (
              <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
                {t('tickers_ranked.loading')}
              </p>
            ) : tickerTop.length === 0 ? (
              <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
                {mode === 'long'
                  ? t('tickers_ranked.no_long_tickers')
                  : t('tickers_ranked.no_short_tickers')}
              </p>
            ) : (
              tickerTop.map((tk, i) => {
                const rightBadge: TickerRowBadge | null = tk.category
                  ? { label: t(`categories.${tk.category}`) }
                  : null
                return (
                  <TickerRow
                    key={tk.symbol}
                    compact
                    href={`/tickers/${tk.symbol}`}
                    rank={i + 1}
                    symbol={tk.symbol}
                    rightText={tk.ticker_maturity_score?.toFixed(1) ?? '-'}
                    rightSmall="/10"
                    sentiment={tk.dominant_sentiment as never}
                    rightBadge={rightBadge}
                  />
                )
              })
            )}
          </div>
          {tickerTotal > 5 && (
            <Link href="/tickers" className="rank-foot">
              {t('top_tickers.show_all_thematic', { n: tickerTotal })}
            </Link>
          )}
        </div>

        {/* Long-term potential directions card */}
        <div className="rank-card">
          <div className="rank-head">
            <div>
              <div className="rank-title">{t('top_tickers.potential_title')}</div>
              <div className="rank-sub">{t('top_tickers.potential_subtitle')}</div>
            </div>
          </div>
          <div>
            {anglesLoading && angleTop.length === 0 ? (
              <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
                {t('tickers_ranked.loading')}
              </p>
            ) : angleTop.length === 0 ? (
              <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
                {t('tickers_ranked.no_angles')}
              </p>
            ) : (
              angleTop.map((d, i) => {
                const inlineBadges: TickerRowBadge[] = []
                if (d.is_ai_pending) {
                  inlineBadges.push({ label: <BotIcon />, title: t('top_tickers.ai_pending') })
                }
                inlineBadges.push({
                  label: (
                    <>
                      <NewspaperIcon />
                      {t('top_tickers.recent_days', { days: d.last_event_days_ago })}
                    </>
                  ),
                  title: d.angle_label,
                })
                const rightBadge: TickerRowBadge | null = d.category
                  ? { label: t(`categories.${d.category}`), title: d.angle_label }
                  : null
                const confPct = d.confidence !== null ? Math.round(d.confidence * 100) : null
                return (
                  <TickerRow
                    key={`${d.ticker_symbol}-${d.umbrella_theme_id}`}
                    compact
                    href={`/tickers/${d.ticker_symbol}`}
                    rank={i + 1}
                    symbol={d.ticker_symbol}
                    rightText={confPct !== null ? String(confPct) : undefined}
                    rightSmall={confPct !== null ? '%' : undefined}
                    inlineBadges={inlineBadges}
                    rightBadge={rightBadge}
                  />
                )
              })
            )}
          </div>
          {angleTotal > 5 && (
            <Link href="/tickers" className="rank-foot">
              {t('top_tickers.show_all_potential', { n: angleTotal })}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
