'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card, Col, Row, Segmented } from 'antd'
import { useI18n } from '@/lib/i18n-context'
import TickerRow, { type TickerRowBadge, NewspaperIcon, BotIcon } from '@/components/TickerRow'
import { SectionTitle } from '@/components/shared/SectionTitle'
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
    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
      <Col xs={24} md={12}>
        <Card size="small" title={<SectionTitle>{t('top_tickers.thematic_title')}</SectionTitle>} extra={thematicExtra}>
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
            tickerTop.map((tk) => {
              const rightBadge: TickerRowBadge | null = tk.category
                ? { label: t(`categories.${tk.category}`) }
                : null
              return (
                <TickerRow
                  key={tk.symbol}
                  compact
                  href={`/tickers/${tk.symbol}`}
                  symbol={tk.symbol}
                  rightText={tk.ticker_maturity_score?.toFixed(1) ?? '-'}
                  rightSmall="/10"
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

      <Col xs={24} md={12}>
        <Card size="small" title={<SectionTitle>{t('top_tickers.potential_title')}</SectionTitle>}>
          {anglesLoading && angleTop.length === 0 ? (
            <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('tickers_ranked.loading')}
            </p>
          ) : angleTop.length === 0 ? (
            <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('tickers_ranked.no_angles')}
            </p>
          ) : (
            angleTop.map((d) => {
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
                  symbol={d.ticker_symbol}
                  rightText={confPct !== null ? String(confPct) : undefined}
                  rightSmall={confPct !== null ? '%' : undefined}
                  inlineBadges={inlineBadges}
                  rightBadge={rightBadge}
                />
              )
            })
          )}
          {angleTotal > 5 && (
            <Link href="/tickers" className="rank-foot">
              {t('top_tickers.show_all_potential', { n: angleTotal })}
            </Link>
          )}
        </Card>
      </Col>
    </Row>
  )
}
