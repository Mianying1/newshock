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
  Spin,
  Typography,
  theme,
} from 'antd'
import {
  ArrowRightOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { FilterPill } from '@/components/shared/FilterPill'
import { FilterLabel } from '@/components/shared/FilterLabel'
import { PageHeader } from '@/components/shared/PageHeader'
import { TrendingUpIcon } from '@/components/shared/NavIcons'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { formatMinutesAgo } from '@/lib/utils'
import type { LongShortTickerRow, AngleDirectionRow, LongShortMode } from '@/lib/ticker-scoring'
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

interface AnglesResponse {
  directions: AngleDirectionRow[]
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

function tierFromScore(s: number | null): 'strong' | 'medium' | 'weak' {
  if (s === null) return 'weak'
  if (s >= 80) return 'strong'
  if (s >= 60) return 'medium'
  return 'weak'
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
  const [anglesData, setAnglesData] = useState<AnglesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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
    fetch('/api/new-angle-candidates?limit=100')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setAnglesData(d)
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
    topTab === 'thematic' ? longShortData?.updated_at : anglesData?.updated_at

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
      return (longShortData?.tickers ?? []).map((tk) => ({
        href: `/tickers/${tk.symbol}`,
        symbol: tk.symbol,
        company_name: tk.company_name,
        group: (tk.sector ?? 'other').toLowerCase().replace(/[\s/]+/g, '_'),
        category_label: tk.category ? t(`categories.${tk.category}`) : null,
        score: tk.ticker_maturity_score !== null ? Math.round(tk.ticker_maturity_score * 10) : null,
      }))
    }
    return (anglesData?.directions ?? []).map((d) => ({
      href: `/tickers/${d.ticker_symbol}`,
      symbol: d.ticker_symbol,
      company_name: null,
      group: d.umbrella_name,
      category_label: d.category ? t(`categories.${d.category}`) : null,
      score: d.confidence !== null ? Math.round(d.confidence * 100) : null,
    }))
  }, [topTab, longShortData, anglesData, t])

  // Resolve a sector key to its locale-aware display label, with raw fallback.
  const groupLabel = (key: string): string => {
    if (topTab !== 'thematic') return key
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
  const shownCount = filteredRows.length
  const visibilityTagText = topTab === 'thematic' ? t('tickers_ranked.tag_mature') : t('tickers_ranked.tag_emerging')

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
              stats={[
                {
                  value: totalCount,
                  label: locale === 'zh' ? '股票' : 'Tickers',
                },
                {
                  value: shownCount,
                  label: locale === 'zh' ? '显示' : 'Shown',
                },
              ]}
              meta={
                updatedLabel
                  ? t('tickers_ranked.updated', { time: updatedLabel })
                  : undefined
              }
            />

            <Flex vertical gap={10} style={{ marginTop: 18, marginBottom: 18 }}>
              <Flex gap={8} wrap align="center">
                <FilterLabel locale={locale}>{t('tickers_ranked.filter_type')}</FilterLabel>
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
              </Flex>

              {topTab === 'thematic' && (
                <Flex gap={8} wrap align="center">
                  <FilterLabel locale={locale}>{t('tickers_ranked.filter_horizon')}</FilterLabel>
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
                </Flex>
              )}

              {groups.length > 0 && (
                <Flex gap={8} wrap align="center">
                  <FilterLabel locale={locale}>{t('tickers_ranked.filter_sector')}</FilterLabel>
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
                </Flex>
              )}
            </Flex>

            {loading && (
              <div style={{ padding: '60px 0', textAlign: 'center' }}>
                <Spin />
              </div>
            )}

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
                  const tier = tierFromScore(row.score)
                  const tierLabel = t(`tickers_ranked.visibility_${tier}`)
                  const tierColor =
                    tier === 'strong'
                      ? token.colorSuccess
                      : tier === 'medium'
                      ? token.colorTextSecondary
                      : token.colorTextQuaternary
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
                      <Flex
                        align="center"
                        gap={10}
                        style={{
                          fontSize: 11,
                          color: token.colorTextTertiary,
                          letterSpacing: '0.04em',
                          marginBottom: 8,
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
                        <span style={{ color: token.colorTextQuaternary }}>·</span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: token.colorTextQuaternary,
                          }}
                        >
                          {visibilityTagText}
                        </span>
                        {row.category_label && (
                          <>
                            <span style={{ color: token.colorTextQuaternary }}>·</span>
                            <span style={{ color: token.colorTextSecondary }}>
                              {row.category_label}
                            </span>
                          </>
                        )}
                        <span style={{ color: token.colorTextQuaternary }}>·</span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: tierColor,
                          }}
                        >
                          {tierLabel}
                        </span>
                        <span style={{ flex: 1 }} />
                        <ArrowRightOutlined
                          style={{ fontSize: 12, color: token.colorTextQuaternary }}
                        />
                      </Flex>

                      <Flex align="baseline" justify="space-between" gap={12}>
                        <Flex align="baseline" gap={10} style={{ minWidth: 0, flex: 1 }}>
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
                        <Text
                          style={{
                            fontFamily: token.fontFamilyCode,
                            fontFeatureSettings: '"tnum", "zero"',
                            fontSize: 22,
                            fontWeight: 500,
                            color: token.colorText,
                            lineHeight: 1,
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {row.score ?? '—'}
                        </Text>
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
