'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card, Col, Row, Segmented } from 'antd'
import { useI18n } from '@/lib/i18n-context'
import TickerRow, { type TickerRowBadge } from '@/components/TickerRow'
import { SectionTitle } from '@/components/shared/SectionTitle'
import { TickerCardSkeletonList } from '@/components/skeleton'
import type { LongShortTickerRow, PotentialTickerRow, LongShortMode } from '@/lib/ticker-scoring'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LongShortResponse {
  mode: LongShortMode
  tickers: LongShortTickerRow[]
  total: number
}

interface PotentialResponse {
  tickers: PotentialTickerRow[]
  total: number
}

export function TopTickersSection() {
  const { t } = useI18n()
  const [mode, setMode] = useState<LongShortMode>('long')

  const { data: tickers, isLoading: tickersLoading } = useSWR<LongShortResponse>(
    `/api/tickers/long-short?mode=${mode}&limit=50`,
    fetcher
  )
  const { data: potential, isLoading: potentialLoading } = useSWR<PotentialResponse>(
    `/api/tickers/potential?limit=50`,
    fetcher
  )

  const tickerTop = tickers?.tickers.slice(0, 5) ?? []
  const tickerTotal = tickers?.total ?? 0
  const potentialTop = potential?.tickers?.slice(0, 5) ?? []
  const potentialTotal = potential?.total ?? 0

  const thematicExtra = (
    <Segmented
      size="small"
      value={mode}
      onChange={(v) => setMode(v as LongShortMode)}
      options={[
        { label: t('tickers_ranked.subtab_long'), value: 'long' },
        { label: t('tickers_ranked.subtab_short'), value: 'short' },
      ]}
    />
  )

  return (
    <Row gutter={[16, 16]} style={{ marginTop: 16 }} align="stretch">
      <Col xs={24} md={12} style={{ display: 'flex' }}>
        <Card
          size="small"
          hoverable
          title={<SectionTitle>{t('top_tickers.thematic_title')}</SectionTitle>}
          extra={thematicExtra}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
        >
          {tickersLoading && tickerTop.length === 0 ? (
            <TickerCardSkeletonList count={5} />
          ) : tickerTop.length === 0 ? (
            <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {mode === 'long'
                ? t('tickers_ranked.no_long_tickers')
                : t('tickers_ranked.no_short_tickers')}
            </p>
          ) : (
            tickerTop.map((tk) => {
              const rightBadge: TickerRowBadge | null = tk.category
                ? { label: t(`categories.${tk.category}`) }
                : null
              const raw = mode === 'long' ? tk.long_score : tk.short_score
              const score = raw !== null && raw !== undefined ? Math.round(raw) : null
              const tooltipKey = mode === 'long' ? 'ticker_detail.long_score_tooltip' : 'ticker_detail.short_score_tooltip'
              return (
                <TickerRow
                  key={tk.symbol}
                  compact
                  href={`/tickers/${tk.symbol}`}
                  symbol={tk.symbol}
                  rightText={score !== null ? String(score) : '-'}
                  rightSmall=" / 100"
                  rightTooltip={t(tooltipKey)}
                  rightBadge={rightBadge}
                />
              )
            })
          )}
          {tickerTotal > 5 && (
            <Link href="/tickers" className="rank-foot">
              {t('top_tickers.show_all_thematic', { n: tickerTotal })}
            </Link>
          )}
        </Card>
      </Col>

      <Col xs={24} md={12} style={{ display: 'flex' }}>
        <Card
          size="small"
          hoverable
          title={<SectionTitle>{t('top_tickers.potential_title')}</SectionTitle>}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
        >
          {potentialLoading && potentialTop.length === 0 ? (
            <TickerCardSkeletonList count={5} />
          ) : potentialTop.length === 0 ? (
            <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('tickers_ranked.no_angles')}
            </p>
          ) : (
            potentialTop.map((tk) => {
              const rightBadge: TickerRowBadge | null = tk.category
                ? { label: t(`categories.${tk.category}`) }
                : null
              const score = Math.round(tk.potential_score)
              return (
                <TickerRow
                  key={tk.symbol}
                  compact
                  href={`/tickers/${tk.symbol}`}
                  symbol={tk.symbol}
                  rightText={String(score)}
                  rightSmall=" / 100"
                  rightTooltip={t('ticker_detail.potential_score_tooltip')}
                  rightBadge={rightBadge}
                />
              )
            })
          )}
          {potentialTotal > 5 && (
            <Link href="/tickers" className="rank-foot">
              {t('top_tickers.show_all_potential', { n: potentialTotal })}
            </Link>
          )}
        </Card>
      </Col>
    </Row>
  )
}
