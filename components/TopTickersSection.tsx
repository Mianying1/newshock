'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'
import type { LongShortTickerRow, NewAngleCandidateRow, LongShortMode } from '@/lib/ticker-scoring'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LongShortResponse {
  mode: LongShortMode
  tickers: LongShortTickerRow[]
  total: number
}

interface AnglesResponse {
  candidates: NewAngleCandidateRow[]
  total: number
}

const SENTIMENT_DOT: Record<string, { color: string; glyph: string }> = {
  bullish: { color: '#10b981', glyph: '●' },
  mixed: { color: '#a1a1aa', glyph: '●' },
  bearish: { color: '#f43f5e', glyph: '●' },
  neutral: { color: '#d4d4d8', glyph: '○' },
}

const TICKER_TYPE_COLOR: Record<string, string> = {
  core_hold: '#2563eb',
  short_catalyst: '#d97706',
  watch: '#71717a',
  golden_leap: '#059669',
}

function TickerRankRow({ row, rank }: { row: LongShortTickerRow; rank: number }) {
  const { t } = useI18n()
  const sent = SENTIMENT_DOT[row.dominant_sentiment ?? 'neutral'] ?? SENTIMENT_DOT.neutral
  const typeColor = row.ticker_type ? TICKER_TYPE_COLOR[row.ticker_type] ?? '#71717a' : null
  const typeLabel = row.ticker_type ? t(`ticker_type.${row.ticker_type}`) : null

  return (
    <Link href={`/tickers/${row.symbol}`} className="rank-row">
      <div className="n">{rank}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="sym" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{row.symbol}</span>
          <span style={{ color: sent.color, fontSize: 11, lineHeight: 1 }} title={row.dominant_sentiment ?? 'neutral'}>
            {sent.glyph}
          </span>
          {typeLabel && (
            <span
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                border: `1px solid ${typeColor}33`,
                color: typeColor ?? undefined,
                background: `${typeColor}14`,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
              {typeLabel}
            </span>
          )}
        </div>
        <div className="nm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.theme_name}
        </div>
      </div>
      <div className="sc">
        {row.ticker_maturity_score?.toFixed(1) ?? '-'}
        <small>/10</small>
      </div>
      <div className="more">›</div>
    </Link>
  )
}

function AngleRankRow({ row, rank }: { row: NewAngleCandidateRow; rank: number }) {
  const { t } = useI18n()
  const isUnreviewed = row.reviewed_at === null
  const confPct = row.confidence !== null ? Math.round(row.confidence * 100) : null

  return (
    <Link href="/tickers" className="rank-row">
      <div className="n">{rank}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="sym" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.angle_label}
          </span>
          {isUnreviewed && (
            <span
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid #c4b5fd',
                color: '#6d28d9',
                background: '#f5f3ff',
                fontWeight: 500,
              }}
            >
              🤖 {t('new_angle.ai_flag')}
            </span>
          )}
        </div>
        <div className="nm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.umbrella_theme_name}
        </div>
      </div>
      {confPct !== null && (
        <div className="sc">
          {confPct}
          <small>%</small>
        </div>
      )}
      <div className="more">›</div>
    </Link>
  )
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
  const angleTop = angles?.candidates.slice(0, 5) ?? []
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
              <div className="rank-title">{t('tickers_ranked.thematic_leaders')}</div>
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
              tickerTop.map((tk, i) => (
                <TickerRankRow key={`${tk.symbol}-${tk.theme_id}`} row={tk} rank={i + 1} />
              ))
            )}
          </div>
          {tickerTotal > 5 && (
            <Link href="/tickers" className="rank-foot">
              {t('top_tickers.show_all_thematic', { n: tickerTotal })}
            </Link>
          )}
        </div>

        {/* New angle candidates card */}
        <div className="rank-card">
          <div className="rank-head">
            <div>
              <div className="rank-title">{t('tickers_ranked.potential_leaders')}</div>
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
              angleTop.map((a, i) => (
                <AngleRankRow key={a.id} row={a} rank={i + 1} />
              ))
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
