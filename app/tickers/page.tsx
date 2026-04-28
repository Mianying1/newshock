'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Badge,
  Button,
  Empty,
  Flex,
  Grid,
  Input,
  Layout,
  Space,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import {
  ArrowRightOutlined,
  InfoCircleOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { FilterPill } from '@/components/shared/FilterPill'
import { FilterLabel } from '@/components/shared/FilterLabel'
import { FilterPillRow } from '@/components/shared/FilterPillRow'
import { PageHeader } from '@/components/shared/PageHeader'
import { TrendingUpIcon } from '@/components/shared/NavIcons'
import { TickerRowSkeletonList } from '@/components/skeleton'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { formatMinutesAgo } from '@/lib/utils'
import type { LongShortTickerRow, PotentialTickerRow, LongShortMode } from '@/lib/ticker-scoring'
import '../radar.css'

const { Text, Title } = Typography
const { Header, Content } = Layout
const { useToken } = theme
const { useBreakpoint } = Grid

type TopTab = 'thematic' | 'potential'

interface LongShortResponse {
  mode: LongShortMode
  tickers: LongShortTickerRow[]
  total: number
  limit: number
  updated_at: string
}

interface PotentialResponse {
  tickers: PotentialTickerRow[]
  total: number
  limit: number
  updated_at: string
}

interface NormalizedRow {
  href: string
  symbol: string
  company_name: string | null
  group: string                // sector or umbrella
  category_label: string | null
  score: number | null         // 0-100
}

export default function TickersPage() {
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const { mode: themeMode, toggle } = useThemeMode()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const sidePad = isMobile ? 16 : 28

  const [topTab, setTopTab] = useState<TopTab>('thematic')
  const [mode, setMode] = useState<LongShortMode>('long')
  const [activeGroup, setActiveGroup] = useState<string>('')

  const [longShortData, setLongShortData] = useState<LongShortResponse | null>(null)
  const [potentialData, setPotentialData] = useState<PotentialResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [counts, setCounts] = useState<{ long: number | null; short: number | null; potential: number | null }>({
    long: null,
    short: null,
    potential: null,
  })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/tickers/long-short?tab=long&limit=200').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/tickers/long-short?tab=short&limit=200').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/tickers/potential?limit=200').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([l, s, p]) => {
        if (cancelled) return
        setCounts({
          long: l?.tickers?.length ?? null,
          short: s?.tickers?.length ?? null,
          potential: p?.tickers?.length ?? null,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (topTab !== 'thematic') return
    let cancelled = false
    setLoading(true)
    setError(false)
    setActiveGroup('')
    fetch(`/api/tickers/long-short?tab=${mode}&limit=100`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setLongShortData(d)
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
  }, [topTab, mode])

  useEffect(() => {
    if (topTab !== 'potential') return
    let cancelled = false
    setLoading(true)
    setError(false)
    setActiveGroup('')
    fetch('/api/tickers/potential?limit=100')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setPotentialData(d)
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
  }, [topTab])

  const activeUpdatedAt =
    topTab === 'thematic' ? longShortData?.updated_at : potentialData?.updated_at

  const updatedLabel = activeUpdatedAt
    ? formatMinutesAgo(
        Math.max(0, Math.floor((Date.now() - new Date(activeUpdatedAt).getTime()) / 60000)),
        t,
      )
    : ''

  // Normalize both data sources to a single row shape.
  // For thematic: collapse case variants (Pharma/pharma) by lowercasing the sector key.
  const allRows: NormalizedRow[] = useMemo(() => {
    if (topTab === 'thematic') {
      return (longShortData?.tickers ?? []).map((tk) => {
        const raw = mode === 'long' ? tk.long_score : tk.short_score
        return {
          href: `/tickers/${tk.symbol}`,
          symbol: tk.symbol,
          company_name: tk.company_name,
          group: (tk.sector ?? 'other').toLowerCase().replace(/[\s/]+/g, '_'),
          category_label: tk.category ? t(`categories.${tk.category}`) : null,
          score: raw !== null && raw !== undefined ? Math.round(raw) : null,
        }
      })
    }
    return (potentialData?.tickers ?? []).map((tk) => ({
      href: `/tickers/${tk.symbol}`,
      symbol: tk.symbol,
      company_name: tk.company_name,
      group: (tk.sector ?? 'other').toLowerCase().replace(/[\s/]+/g, '_'),
      category_label: tk.category ? t(`categories.${tk.category}`) : null,
      score: Math.round(tk.potential_score),
    }))
  }, [topTab, mode, longShortData, potentialData, t])

  // Resolve a sector key to its locale-aware display label, with raw fallback.
  const groupLabel = (key: string): string => {
    const tr = t(`tickers_ranked.sectors.${key}`)
    return tr === `tickers_ranked.sectors.${key}` ? key : tr
  }

  // Group counts for chips: sort by count desc, then by display label,
  // and pin "other" to the very end.
  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of allRows) counts.set(r.group, (counts.get(r.group) ?? 0) + 1)
    const entries = Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1] || groupLabel(a[0]).localeCompare(groupLabel(b[0])),
    )
    const otherIdx = entries.findIndex(([k]) => k === 'other')
    if (otherIdx >= 0) {
      const [other] = entries.splice(otherIdx, 1)
      entries.push(other)
    }
    return entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, topTab, locale])

  const filteredRows = useMemo(
    () => (activeGroup ? allRows.filter((r) => r.group === activeGroup) : allRows),
    [allRows, activeGroup],
  )

  const totalCount = allRows.length
  const headerDescription = (
    <ScoreCountSummary
      counts={counts}
      labels={{
        long: t('tickers_ranked.score_label_long'),
        short: t('tickers_ranked.score_label_short'),
        potential: t('tickers_ranked.score_label_potential'),
      }}
      tooltips={{
        long: t('ticker_detail.long_score_tooltip'),
        short: t('ticker_detail.short_score_tooltip'),
        potential: t('ticker_detail.potential_score_tooltip'),
      }}
      tokenColor={token.colorTextTertiary}
    />
  )

  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <Layout style={{ background: 'transparent' }}>
          <Topbar sidePad={sidePad} />

          <Content
            style={{
              padding: `0 ${sidePad}px 40px`,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <PageHeader
              title={t('sidebar.tickers')}
              icon={<TrendingUpIcon />}
              description={headerDescription}
              meta={
                updatedLabel
                  ? t('tickers_ranked.updated', { time: updatedLabel })
                  : undefined
              }
            />

            <Flex vertical gap={10} className="filters-bar" style={{ marginTop: 18, marginBottom: 18 }}>
              <FilterPillRow
                label={
                  <FilterLabel locale={locale} minWidth={locale === 'zh' ? 24 : 60}>
                    {t('tickers_ranked.filter_type')}
                  </FilterLabel>
                }
              >
                <FilterPill
                  label={t('tickers_ranked.tab_thematic')}
                  active={topTab === 'thematic'}
                  onClick={() => setTopTab('thematic')}
                />
                <FilterPill
                  label={t('tickers_ranked.tab_potential')}
                  active={topTab === 'potential'}
                  onClick={() => setTopTab('potential')}
                />
              </FilterPillRow>

              {topTab === 'thematic' && (
                <FilterPillRow
                  label={
                    <FilterLabel locale={locale} minWidth={locale === 'zh' ? 24 : 60}>
                      {t('tickers_ranked.filter_horizon')}
                    </FilterLabel>
                  }
                >
                  <FilterPill
                    label={t('tickers_ranked.subtab_long')}
                    active={mode === 'long'}
                    onClick={() => setMode('long')}
                  />
                  <FilterPill
                    label={t('tickers_ranked.subtab_short')}
                    active={mode === 'short'}
                    onClick={() => setMode('short')}
                  />
                </FilterPillRow>
              )}

              {groups.length > 0 && (
                <FilterPillRow
                  label={
                    <FilterLabel locale={locale} minWidth={locale === 'zh' ? 24 : 60}>
                      {t('tickers_ranked.filter_sector')}
                    </FilterLabel>
                  }
                >
                  <FilterPill
                    label={t('tickers_ranked.filter_all')}
                    count={totalCount}
                    active={activeGroup === ''}
                    onClick={() => setActiveGroup('')}
                  />
                  {groups.map(([g, n]) => (
                    <FilterPill
                      key={g}
                      label={groupLabel(g)}
                      count={n}
                      active={activeGroup === g}
                      onClick={() => setActiveGroup(g)}
                    />
                  ))}
                </FilterPillRow>
              )}
            </Flex>

            {loading && <TickerRowSkeletonList count={10} />}

            {error && !loading && (
              <Empty description={t('common.error')} style={{ padding: '60px 0' }} />
            )}

            {!loading && !error && filteredRows.length === 0 && (
              <Empty
                description={
                  topTab === 'thematic'
                    ? mode === 'long'
                      ? t('tickers_ranked.no_long_tickers')
                      : t('tickers_ranked.no_short_tickers')
                    : t('tickers_ranked.no_angles')
                }
                style={{ padding: '60px 0' }}
              />
            )}

            {!loading && !error && filteredRows.length > 0 && (
              <Flex vertical gap={10}>
                {filteredRows.map((row, i) => {
                  const scoreTooltip =
                    topTab === 'thematic'
                      ? mode === 'long'
                        ? t('ticker_detail.long_score_tooltip')
                        : t('ticker_detail.short_score_tooltip')
                      : t('ticker_detail.potential_score_tooltip')
                  const scoreLabel =
                    topTab === 'thematic'
                      ? mode === 'long'
                        ? t('tickers_ranked.score_label_long')
                        : t('tickers_ranked.score_label_short')
                      : t('tickers_ranked.score_label_potential')
                  return (
                    <Link
                      key={`${row.symbol}-${i}`}
                      href={row.href}
                      className="ticker-card hover-card"
                      style={{
                        display: 'block',
                        padding: '14px 18px',
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: token.borderRadiusLG,
                        background: token.colorBgContainer,
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                    >
                      <Flex align="center" justify="space-between" gap={16}>
                        <Flex vertical gap={8} style={{ minWidth: 0, flex: 1 }}>
                          <Flex
                            align="center"
                            gap={10}
                            style={{
                              fontSize: 11,
                              color: token.colorTextTertiary,
                              letterSpacing: '0.04em',
                              fontFeatureSettings: '"tnum"',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: token.fontFamilyCode,
                                color: token.colorTextQuaternary,
                              }}
                            >
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            {row.category_label && (
                              <>
                                <span style={{ color: token.colorTextQuaternary }}>·</span>
                                <span style={{ color: token.colorTextSecondary }}>
                                  {row.category_label}
                                </span>
                              </>
                            )}
                          </Flex>
                          <Flex align="baseline" gap={10} style={{ minWidth: 0 }}>
                            <Text
                              style={{
                                fontFamily: token.fontFamilyCode,
                                fontSize: 18,
                                fontWeight: 600,
                                color: token.colorText,
                                letterSpacing: '0.01em',
                                lineHeight: 1.2,
                              }}
                            >
                              {row.symbol}
                            </Text>
                            {row.company_name && (
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: token.colorTextTertiary,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {row.company_name}
                              </Text>
                            )}
                          </Flex>
                        </Flex>
                        <span
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'baseline',
                              fontFamily: token.fontFamilyCode,
                              fontFeatureSettings: '"tnum", "zero"',
                              lineHeight: 1,
                              letterSpacing: '-0.01em',
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: token.fontFamilyCode,
                                fontSize: 24,
                                fontWeight: 500,
                                color: token.colorText,
                                lineHeight: 1,
                              }}
                            >
                              {row.score ?? '—'}
                            </Text>
                            <Text
                              style={{
                                fontFamily: token.fontFamilyCode,
                                fontSize: 12,
                                color: token.colorTextQuaternary,
                                marginLeft: 4,
                                lineHeight: 1,
                              }}
                            >
                              / 100
                            </Text>
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 10,
                              fontWeight: 500,
                              color: token.colorTextTertiary,
                              letterSpacing: '0.08em',
                              lineHeight: 1,
                            }}
                          >
                            {scoreLabel}
                            <Tooltip title={scoreTooltip}>
                              <InfoCircleOutlined
                                style={{
                                  fontSize: 10,
                                  color: token.colorTextQuaternary,
                                  cursor: 'help',
                                }}
                                tabIndex={0}
                                onClick={(e) => e.preventDefault()}
                              />
                            </Tooltip>
                          </span>
                        </span>
                      </Flex>
                    </Link>
                  )
                })}
              </Flex>
            )}
          </Content>
        </Layout>
      </div>
    </div>
  )
}

function ScoreCountSummary({
  counts,
  labels,
  tooltips,
  tokenColor,
}: {
  counts: { long: number | null; short: number | null; potential: number | null }
  labels: { long: string; short: string; potential: string }
  tooltips: { long: string; short: string; potential: string }
  tokenColor: string
}) {
  const segments: Array<{ key: 'long' | 'short' | 'potential'; count: number | null; label: string; tip: string }> = [
    { key: 'long', count: counts.long, label: labels.long, tip: tooltips.long },
    { key: 'short', count: counts.short, label: labels.short, tip: tooltips.short },
    { key: 'potential', count: counts.potential, label: labels.potential, tip: tooltips.potential },
  ]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 4 }}>
      {segments.map((s, i) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ margin: '0 8px', color: tokenColor }}>·</span>}
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
            {s.count ?? '—'}
          </span>
          <span>{s.label}</span>
          <Tooltip title={s.tip} placement="top" overlayStyle={{ maxWidth: 320 }}>
            <InfoCircleOutlined
              style={{ fontSize: 12, color: tokenColor, cursor: 'pointer' }}
            />
          </Tooltip>
        </span>
      ))}
    </span>
  )
}
