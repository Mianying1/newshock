'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Flex,
  Input,
  Layout,
  Progress,
  Row,
  Segmented,
  Space,
  Tag,
  Typography,
  theme as antdTheme,
} from 'antd'
import {
  ApiOutlined,
  BankOutlined,
  BuildOutlined,
  GlobalOutlined,
  LineChartOutlined,
  MoonOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SunOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { pickField } from '@/lib/useField'
import { formatRelativeTime } from '@/lib/utils'
import { formatCategoryLabel } from '@/lib/theme-formatter'
import { getDisplayPublisher } from '@/lib/source-display'
import type {
  CatalystEvent,
  CounterEvidenceSummary,
  DriverIcon,
  EventDirection,
  RecentDriver,
  ThemeRadarItem,
  ThemeRecommendation,
} from '@/types/recommendations'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { ThemeCard } from '@/components/radar/ThemeCard'
import { stageColor as getStageColor } from '@/lib/design-tokens'
import '../../radar.css'

const { Title, Text } = Typography
const { Header, Content } = Layout
const { useToken } = antdTheme

type EventTab = 'all' | EventDirection
type EventGroup = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'older'

const GROUP_ORDER: EventGroup[] = ['today', 'yesterday', 'this_week', 'last_week', 'older']
const GROUP_LABEL: Record<EventGroup, string> = {
  today: 'theme_detail.events_today',
  yesterday: 'theme_detail.events_yesterday',
  this_week: 'theme_detail.events_this_week',
  last_week: 'theme_detail.events_last_week',
  older: 'theme_detail.events_older',
}

function groupKey(daysAgo: number): EventGroup {
  if (daysAgo <= 0) return 'today'
  if (daysAgo === 1) return 'yesterday'
  if (daysAgo < 7) return 'this_week'
  if (daysAgo < 14) return 'last_week'
  return 'older'
}

function convictionBand(score: number): 'high' | 'medium' | 'low' {
  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}
function barClass(score: number): 'up' | 'mid' | 'low' {
  if (score >= 7) return 'up'
  if (score >= 4) return 'mid'
  return 'low'
}

function dirDot(d: EventDirection | null): string {
  if (d === 'supports') return 'sup'
  if (d === 'contradicts') return 'con'
  return 'neu'
}

export default function ThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const { mode, toggle } = useThemeMode()
  const [theme, setTheme] = useState<ThemeRadarItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showAllDiffs, setShowAllDiffs] = useState(false)
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [eventTab, setEventTab] = useState<EventTab>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: allThemesResp } = useSWR<{ themes: ThemeRadarItem[] }>(
    theme?.child_themes && theme.child_themes.length > 0 ? '/api/themes' : null,
    (url: string) => fetch(url).then((r) => r.json()),
  )
  const childThemeItems = useMemo(() => {
    if (!theme?.child_themes?.length || !allThemesResp?.themes) return []
    const ids = new Set(theme.child_themes.map((c) => c.id))
    const byId = new Map(allThemesResp.themes.map((th) => [th.id, th]))
    return theme.child_themes
      .map((c) => byId.get(c.id))
      .filter((th): th is ThemeRadarItem => Boolean(th))
      // eslint-disable-next-line react-hooks/exhaustive-deps
      .slice(0, ids.size)
  }, [theme?.child_themes, allThemesResp?.themes])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(false)
    fetch(`/api/themes/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((data) => {
        setTheme(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [id])

  const recs = theme?.recommendations ?? []
  const headwinds = recs.filter((r) => r.exposure_direction === 'headwind' && r.exposure_type !== 'pressure')
  const tradableRecs = recs.filter((r) => r.exposure_type !== 'pressure' && r.exposure_direction !== 'headwind')
  const tier1Recs = tradableRecs.filter((r) => r.tier === 1)
  const tier2Recs = tradableRecs.filter((r) => r.tier === 2)
  const tier3Recs = tradableRecs.filter((r) => r.tier === 3)

  const catalysts = useMemo(() => theme?.catalysts ?? [], [theme])
  const eventCounts = useMemo(() => ({
    all: catalysts.length,
    supports: catalysts.filter((c) => c.supports_or_contradicts === 'supports').length,
    contradicts: catalysts.filter((c) => c.supports_or_contradicts === 'contradicts').length,
    neutral: catalysts.filter((c) => c.supports_or_contradicts === 'neutral').length,
  }), [catalysts])
  const hasDirection = eventCounts.supports + eventCounts.contradicts + eventCounts.neutral > 0

  const filteredEvents = eventTab === 'all'
    ? catalysts
    : catalysts.filter((c) => c.supports_or_contradicts === eventTab)
  const limitedEvents = showAllEvents ? filteredEvents : filteredEvents.slice(0, 8)

  const groupedEvents = useMemo(() => {
    const map = new Map<EventGroup, CatalystEvent[]>()
    for (const c of limitedEvents) {
      const k = groupKey(c.days_ago)
      const arr = map.get(k) ?? []
      arr.push(c)
      map.set(k, arr)
    }
    return map
  }, [limitedEvents])

  const toggleExpand = (eid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(eid)) next.delete(eid)
      else next.add(eid)
      return next
    })
  }

  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <Layout style={{ background: 'transparent' }}>
          <Header
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              height: 52,
              padding: '10px 28px',
              background: 'var(--topbar-bg)',
              backdropFilter: 'saturate(160%) blur(16px)',
              WebkitBackdropFilter: 'saturate(160%) blur(16px)',
              borderBottom: `1px solid ${token.colorBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Input
              disabled
              prefix={<SearchOutlined />}
              placeholder={t('topbar.search_placeholder')}
              suffix={
                <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: token.colorTextQuaternary }}>
                  {t('topbar.search_soon')}
                </Text>
              }
              style={{ flex: 1 }}
            />
            <Space.Compact className="topbar-actions">
              <Button
                className="topbar-iconbtn"
                type="default"
                aria-label={t('topbar.toggle_locale')}
                onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              >
                <span key={locale} className="topbar-iconbtn-inner">
                  {locale === 'en' ? 'EN' : '中'}
                </span>
              </Button>
              <Button
                className="topbar-iconbtn"
                type="default"
                aria-label={t(mode === 'dark' ? 'topbar.switch_light' : 'topbar.switch_dark')}
                icon={
                  <span key={mode} className="topbar-iconbtn-inner">
                    {mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                  </span>
                }
                onClick={toggle}
              />
            </Space.Compact>
          </Header>

          <Content style={{ padding: '0 28px 40px' }}>
            {loading && (
              <p style={{ padding: '60px 0', textAlign: 'center', fontSize: 12, color: token.colorTextQuaternary }}>
                {t('theme_detail.loading')}
              </p>
            )}
            {error && (
              <p style={{ padding: '60px 0', textAlign: 'center', fontSize: 12, color: token.colorTextQuaternary }}>
                {t('theme_detail.error')}
              </p>
            )}

            {theme && (() => {
              const themeName = pickField(locale, theme.name, theme.name_zh)
              let secCounter = 0
              const nextIdx = () => String(++secCounter).padStart(2, '0')
              return (
              <>
                <Breadcrumb
                  style={{ margin: '20px 0 4px', fontSize: 12 }}
                  items={[
                    { title: <Link href="/">{t('sidebar.radar')}</Link> },
                    { title: <Link href="/themes">{t('sidebar.themes')}</Link> },
                    { title: themeName },
                  ]}
                />

                <div style={{ padding: '20px 2px 24px', borderBottom: `1px solid ${token.colorSplit}` }}>
                  <Flex align="center" gap={10} wrap style={{ marginBottom: 14 }}>
                    <Tag
                      style={{
                        margin: 0,
                        background: token.colorFillAlter,
                        color: token.colorTextSecondary,
                        border: `1px solid ${token.colorBorder}`,
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '2px 10px',
                        borderRadius: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {formatCategoryLabel(theme.category)}
                    </Tag>
                    {theme.theme_tier === 'umbrella' && (
                      <Tag
                        style={{
                          margin: 0,
                          background: token.colorFillAlter,
                          color: token.colorTextSecondary,
                          border: `1px solid ${token.colorBorder}`,
                          fontSize: 12,
                          fontWeight: 500,
                          padding: '2px 10px',
                          borderRadius: 4,
                          lineHeight: 1.5,
                        }}
                      >
                        {t('theme_detail.badge_umbrella')}
                      </Tag>
                    )}
                    {theme.parent_theme && (
                      <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                        {t('theme_detail.parent_theme')}{' '}
                        <Link href={`/themes/${theme.parent_theme.id}`} style={{ color: token.colorLink, textDecoration: 'none' }}>
                          {pickField(locale, theme.parent_theme.name, theme.parent_theme.name_zh)}
                        </Link>
                      </Text>
                    )}
                  </Flex>

                  <Flex align="flex-start" justify="space-between" gap={24} wrap>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Flex align="flex-start" gap={14} wrap>
                        <Title
                          level={1}
                          style={{
                            margin: 0,
                            fontSize: 32,
                            fontWeight: 600,
                            letterSpacing: '-0.02em',
                            lineHeight: 1.2,
                            color: token.colorText,
                          }}
                        >
                          {themeName}
                        </Title>
                        <span style={{ paddingTop: 10 }}>
                          <FocusLevelBadge strength={theme.theme_strength_score} />
                        </span>
                      </Flex>
                      {(() => {
                        const summary = pickField(locale, theme.summary, theme.summary_zh)
                        const firstSentence = summary ? summary.split(/[。.]/)[0].trim() : ''
                        return firstSentence ? (
                          <Text
                            style={{
                              display: 'block',
                              marginTop: 10,
                              fontSize: 13,
                              lineHeight: 1.6,
                              color: token.colorTextTertiary,
                              maxWidth: 640,
                            }}
                          >
                            {firstSentence}
                          </Text>
                        ) : null
                      })()}
                    </div>

                    <Flex gap={28} align="flex-start" style={{ paddingTop: 4 }}>
                      <KPICell label="Strength" value={theme.theme_strength_score} token={token} />
                      {theme.conviction_score !== null && (
                        <KPICell
                          label="Conviction"
                          value={`${theme.conviction_score >= 5 ? '+' : ''}${theme.conviction_score.toFixed(1)}`}
                          token={token}
                          tone={theme.conviction_score >= 5 ? 'up' : 'down'}
                        />
                      )}
                      <KPICell label="Events" value={theme.event_count} token={token} />
                    </Flex>
                  </Flex>
                </div>

                {/* Hero stats — gauge + 4 stat cells */}
                {(() => {
                  const pb = theme.archetype_playbook
                  const daysMin = pb?.typical_duration_days_approx?.[0] || 0
                  const daysMax = pb?.typical_duration_days_approx?.[1] || 0
                  const progressPercent = daysMax > 0
                    ? Math.min(100, Math.round((theme.days_hot / daysMax) * 100))
                    : 0
                  const stageText = t(`theme_card.stage_${theme.playbook_stage === 'beyond' ? 'beyond' : theme.playbook_stage}`)
                  const stageColor = getStageColor(theme.playbook_stage)

                  const formatDuration = (minD: number, maxD: number) => {
                    if (!maxD) return '—'
                    const unit = t('theme_detail.duration_unit_days')
                    const months = t('theme_detail.duration_unit_months')
                    if (maxD >= 90) {
                      const minM = Math.round(minD / 30)
                      const maxM = Math.round(maxD / 30)
                      return minM && minM !== maxM ? `~${minM}–${maxM} ${months}` : `~${maxM} ${months}`
                    }
                    return minD && minD !== maxD ? `~${minD}–${maxD} ${unit}` : `~${maxD} ${unit}`
                  }
                  const durationLabel = formatDuration(daysMin, daysMax)

                  const stageRangeKey =
                    theme.playbook_stage === 'early' ? 'theme_detail.stage_range_early'
                    : theme.playbook_stage === 'mid' ? 'theme_detail.stage_range_mid'
                    : theme.playbook_stage === 'late' ? 'theme_detail.stage_range_late'
                    : theme.playbook_stage === 'beyond' ? 'theme_detail.stage_range_beyond'
                    : 'theme_detail.stage_range_unknown'

                  const categoryLabel = formatCategoryLabel(theme.category)

                  const conv = theme.conviction_score
                  const cev = theme.counter_evidence_summary
                  const bearish = cev && cev.contradicts_count > cev.supports_count
                  const riskTier = bearish
                    ? 'high'
                    : conv !== null && conv >= 7
                    ? 'low'
                    : conv !== null && conv >= 4
                    ? 'mid'
                    : 'high'
                  const riskLabel = t(`theme_detail.risk_${riskTier}`)
                  const riskColor =
                    riskTier === 'low' ? token.colorSuccess
                    : riskTier === 'mid' ? token.colorWarning
                    : token.colorError

                  const reflection = pickField(locale, theme.strategist_reflection, theme.strategist_reflection_zh)
                  const summary = pickField(locale, theme.summary, theme.summary_zh)
                  const conclusion = reflection?.trim() || summary?.trim() || ''
                  const conclusionShort = conclusion.length > 160 ? conclusion.slice(0, 160) + '…' : conclusion

                  const cells = [
                    {
                      key: 'stage',
                      label: t('theme_detail.stage_position'),
                      value: stageText,
                      sub: `${progressPercent}% · ${t(stageRangeKey)}`,
                      color: stageColor,
                    },
                    {
                      key: 'duration',
                      label: t('theme_detail.duration_header'),
                      value: durationLabel,
                      sub: t('theme_detail.historical_median'),
                      color: token.colorPrimary,
                    },
                    {
                      key: 'driver',
                      label: t('theme_detail.core_driver'),
                      value: categoryLabel,
                      sub: theme.theme_tier === 'umbrella' ? t('theme_detail.badge_umbrella') : '—',
                      color: token.colorInfo ?? token.colorPrimary,
                    },
                    {
                      key: 'risk',
                      label: t('theme_detail.risk_level'),
                      value: riskLabel,
                      sub: '',
                      color: riskColor,
                    },
                  ]

                  const gaugeWidth = 160
                  const gaugeStroke = 8
                  const gaugeRadius = (gaugeWidth - gaugeStroke) / 2
                  const gaugeArcLength = Math.PI * gaugeRadius
                  const gaugeProgressLength = (progressPercent / 100) * gaugeArcLength
                  const gaugeCx = gaugeWidth / 2
                  const gaugeCy = gaugeWidth / 2
                  const gaugePath = `M ${gaugeStroke / 2} ${gaugeCy} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeWidth - gaugeStroke / 2} ${gaugeCy}`

                  return (
                    <Card
                      size="small"
                      styles={{ body: { padding: 0 } }}
                      style={{ marginTop: 20, overflow: 'hidden' }}
                    >
                      <Flex align="stretch" wrap>
                        {/* Left: semicircle gauge */}
                        <div
                          style={{
                            width: 200,
                            flexShrink: 0,
                            padding: '20px 16px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            borderRight: `1px solid ${token.colorSplit}`,
                          }}
                        >
                          <div
                            style={{
                              fontFamily: token.fontFamilyCode,
                              fontSize: 10,
                              letterSpacing: '0.18em',
                              textTransform: 'uppercase',
                              color: token.colorTextQuaternary,
                            }}
                          >
                            {t('theme_detail.current_stage')}
                          </div>
                          <div
                            style={{
                              position: 'relative',
                              width: gaugeWidth,
                              height: gaugeWidth / 2 + gaugeStroke,
                            }}
                          >
                            <svg
                              width={gaugeWidth}
                              height={gaugeWidth / 2 + gaugeStroke}
                              viewBox={`0 0 ${gaugeWidth} ${gaugeWidth / 2 + gaugeStroke}`}
                              style={{ display: 'block' }}
                            >
                              <path
                                d={gaugePath}
                                fill="none"
                                stroke={token.colorFillSecondary}
                                strokeWidth={gaugeStroke}
                                strokeLinecap="round"
                              />
                              {progressPercent > 0 && (
                                <path
                                  d={gaugePath}
                                  fill="none"
                                  stroke={stageColor}
                                  strokeWidth={gaugeStroke}
                                  strokeLinecap="round"
                                  strokeDasharray={`${gaugeProgressLength} ${gaugeArcLength}`}
                                />
                              )}
                            </svg>
                            <div
                              style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: gaugeStroke + 2,
                                textAlign: 'center',
                              }}
                            >
                              <Text
                                strong
                                style={{
                                  fontSize: 22,
                                  color: token.colorText,
                                  letterSpacing: '-0.01em',
                                  lineHeight: 1,
                                }}
                              >
                                {stageText}
                              </Text>
                            </div>
                          </div>
                          <Text
                            style={{
                              fontFamily: token.fontFamilyCode,
                              fontSize: 11,
                              color: token.colorTextTertiary,
                              letterSpacing: '0.04em',
                              marginTop: 6,
                            }}
                          >
                            Day {theme.days_hot} / {durationLabel.replace(/^~/, '')}
                          </Text>
                        </div>

                        {/* Right: conclusion + 4 cells */}
                        <div
                          style={{
                            flex: 1,
                            minWidth: 320,
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          {conclusionShort && (
                            <Flex
                              align="flex-start"
                              gap={10}
                              style={{
                                padding: '11px 18px',
                                borderBottom: `1px solid ${token.colorSplit}`,
                                borderLeft: `2px solid ${token.colorSuccess}`,
                              }}
                            >
                              <span
                                style={{
                                  width: 15,
                                  height: 15,
                                  borderRadius: '50%',
                                  background: token.colorSuccess,
                                  color: '#fff',
                                  fontSize: 9,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  marginTop: 2,
                                }}
                              >
                                ✓
                              </span>
                              <Text
                                style={{
                                  fontSize: 12.5,
                                  lineHeight: 1.55,
                                  color: token.colorTextSecondary,
                                }}
                              >
                                <Text strong style={{ color: token.colorText, fontSize: 12.5, marginRight: 4 }}>
                                  {t('theme_detail.hero_conclusion')}：
                                </Text>
                                {conclusionShort}
                              </Text>
                            </Flex>
                          )}

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                              flex: 1,
                            }}
                          >
                            {cells.map((c, i) => (
                              <div
                                key={c.key}
                                style={{
                                  padding: '12px 18px',
                                  borderLeft: i > 0 ? `1px solid ${token.colorSplit}` : 'none',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 3,
                                  minWidth: 0,
                                  justifyContent: 'center',
                                }}
                              >
                                <Flex align="center" gap={6}>
                                  <span
                                    style={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: '50%',
                                      background: c.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Text
                                    style={{
                                      fontFamily: token.fontFamilyCode,
                                      fontSize: 9.5,
                                      letterSpacing: '0.16em',
                                      textTransform: 'uppercase',
                                      color: token.colorTextQuaternary,
                                    }}
                                  >
                                    {c.label}
                                  </Text>
                                </Flex>
                                <Text
                                  strong
                                  style={{
                                    fontSize: 13.5,
                                    color: token.colorText,
                                    lineHeight: 1.3,
                                    letterSpacing: '-0.005em',
                                  }}
                                  ellipsis={{ tooltip: c.value }}
                                >
                                  {c.value}
                                </Text>
                                {c.sub && (
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: token.colorTextTertiary,
                                      lineHeight: 1.4,
                                    }}
                                    ellipsis={{ tooltip: c.sub }}
                                  >
                                    {c.sub}
                                  </Text>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </Flex>
                    </Card>
                  )
                })()}

              <Row gutter={[24, 24]} style={{ marginTop: 0 }}>
                <Col xs={24} lg={17}>

              {/* Why Now — Recent Drivers (backend-clustered, falls back to per-event synthesis) */}
              {(() => {
                const iconMap: Record<DriverIcon, typeof ThunderboltOutlined> = {
                  bolt: ThunderboltOutlined,
                  building: BankOutlined,
                  chip: ApiOutlined,
                  globe: GlobalOutlined,
                  chart: LineChartOutlined,
                  factory: BuildOutlined,
                  shield: SafetyCertificateOutlined,
                }

                const formatDriverDate = (iso: string) => {
                  const d = new Date(iso)
                  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`
                }

                type Card = {
                  key: string
                  Icon: typeof ThunderboltOutlined
                  title: string
                  description: string | null
                  sourceLabel: string
                  href: string | null
                }

                const cards: Card[] = []

                if (theme.recent_drivers && theme.recent_drivers.length > 0) {
                  for (const d of theme.recent_drivers as RecentDriver[]) {
                    cards.push({
                      key: d.title,
                      Icon: iconMap[d.icon] ?? LineChartOutlined,
                      title: pickField(locale, d.title, d.title_zh) ?? d.title,
                      description: pickField(locale, d.description, d.description_zh),
                      sourceLabel: d.source_label,
                      href: d.source_url,
                    })
                  }
                } else {
                  const driverPool = catalysts.filter(
                    (c) => c.supports_or_contradicts === 'supports' || c.supports_or_contradicts === null,
                  )
                  const seen = new Set<string>()
                  const drivers: CatalystEvent[] = []
                  for (const c of driverPool) {
                    const key = (c.source_name || c.id).toLowerCase()
                    if (seen.has(key)) continue
                    seen.add(key)
                    drivers.push(c)
                    if (drivers.length >= 5) break
                  }
                  const iconForSource = (sourceName: string | null) => {
                    const s = (sourceName || '').toLowerCase()
                    if (/iea|power|grid|electric|energy|utility|util/.test(s)) return ThunderboltOutlined
                    if (/aws|microsoft|google|meta|amazon|hyperscal|capex|earning/.test(s)) return BankOutlined
                    if (/nvidia|tsmc|chip|gpu|semi|amd|intel|broadcom/.test(s)) return ApiOutlined
                    if (/reuters|bloomberg|ft|wsj|nyt|economist|guardian/.test(s)) return GlobalOutlined
                    return LineChartOutlined
                  }
                  for (const d of drivers) {
                    const publisher = getDisplayPublisher(d.source_name, d.source_url)
                    cards.push({
                      key: d.id,
                      Icon: iconForSource(d.source_name),
                      title: d.headline,
                      description: null,
                      sourceLabel: `${publisher}, ${formatDriverDate(d.published_at)}`,
                      href: d.source_url || null,
                    })
                  }
                }

                const summary = pickField(locale, theme.summary, theme.summary_zh)
                if (cards.length === 0 && !summary) return null

                return (
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.why_theme_title')}
                      subtitle={t('sections.why_theme_subtitle')}
                    />
                    {summary && (
                      <Text
                        style={{
                          display: 'block',
                          fontSize: 14,
                          color: token.colorTextSecondary,
                          lineHeight: 1.65,
                          marginBottom: 16,
                        }}
                      >
                        {summary}
                      </Text>
                    )}
                    {cards.length === 0 ? null : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 12,
                        alignItems: 'stretch',
                      }}
                    >
                      {cards.map((c) => {
                        const Icon = c.Icon
                        const titleNode = (
                          <Text
                            strong
                            style={{
                              display: 'block',
                              fontSize: 13,
                              color: token.colorText,
                              lineHeight: 1.4,
                            }}
                          >
                            {c.title}
                          </Text>
                        )
                        return (
                          <Card
                            key={c.key}
                            size="small"
                            styles={{
                              body: {
                                padding: '14px 16px',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              },
                            }}
                            style={{ height: '100%' }}
                          >
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: token.borderRadius,
                                background: token.colorFillSecondary,
                                color: token.colorText,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 16,
                              }}
                            >
                              <Icon />
                            </div>
                            {c.href ? (
                              <a
                                href={c.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'inherit', textDecoration: 'none' }}
                              >
                                {titleNode}
                              </a>
                            ) : (
                              titleNode
                            )}
                            {c.description ? (
                              <Text
                                style={{
                                  display: 'block',
                                  fontSize: 12,
                                  color: token.colorTextSecondary,
                                  lineHeight: 1.5,
                                }}
                              >
                                {c.description}
                              </Text>
                            ) : null}
                            <Text
                              style={{
                                display: 'block',
                                fontFamily: token.fontFamilyCode,
                                fontSize: 10,
                                color: token.colorTextQuaternary,
                                letterSpacing: '0.06em',
                                marginTop: 'auto',
                                paddingTop: 4,
                                borderTop: `1px solid ${token.colorSplit}`,
                              }}
                            >
                              {t('theme_detail.driver_source_label')}: {c.sourceLabel}
                            </Text>
                          </Card>
                        )
                      })}
                    </div>
                    )}
                  </div>
                )
              })()}


              {/* Conviction */}
              {theme.conviction_score !== null && theme.conviction_breakdown && (() => {
                const score = theme.conviction_score
                const b = theme.conviction_breakdown
                const band = convictionBand(score)
                const bandLabel = t(`theme_detail.conviction_${band}`)
                const reasoning = pickField(locale, theme.conviction_reasoning, theme.conviction_reasoning_zh)
                const dims = [
                  { key: 'hf', labelKey: 'theme_detail.historical_fit', hintKey: 'theme_detail.historical_fit_hint', value: b.historical_fit, inverted: false },
                  { key: 'es', labelKey: 'theme_detail.evidence_strength', hintKey: 'theme_detail.evidence_strength_hint', value: b.evidence_strength, inverted: false },
                  { key: 'pr', labelKey: 'theme_detail.priced_in_risk', hintKey: 'theme_detail.priced_in_risk_hint', value: b.priced_in_risk, inverted: true },
                  { key: 'ed', labelKey: 'theme_detail.exit_signal_distance', hintKey: 'theme_detail.exit_signal_distance_hint', value: b.exit_signal_distance, inverted: false },
                ]
                const scoreColor =
                  barClass(score) === 'up' ? token.colorSuccess
                  : barClass(score) === 'mid' ? token.colorWarning
                  : token.colorError
                return (
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.theme_conviction_title')}
                      subtitle={t('sections.theme_conviction_subtitle')}
                    />
                    <Card size="small" styles={{ body: { padding: '18px 20px' } }}>
                      <Flex align="center" justify="space-between" gap={24} wrap style={{ marginBottom: 18 }}>
                        <div>
                          <div
                            style={{
                              fontFamily: token.fontFamilyCode,
                              fontSize: 10,
                              letterSpacing: '0.16em',
                              textTransform: 'uppercase',
                              color: token.colorTextQuaternary,
                              marginBottom: 6,
                            }}
                          >
                            {bandLabel}
                          </div>
                          <Flex align="baseline" gap={4}>
                            <span
                              style={{
                                fontFamily: token.fontFamilyCode,
                                fontSize: 34,
                                fontWeight: 600,
                                lineHeight: 1,
                                color: token.colorText,
                                letterSpacing: '-0.02em',
                              }}
                            >
                              {score.toFixed(1)}
                            </span>
                            <Text style={{ fontSize: 12, color: token.colorTextQuaternary }}>/ 10</Text>
                          </Flex>
                        </div>
                        <div style={{ flex: 1, minWidth: 160, maxWidth: 280 }}>
                          <Progress
                            percent={(score / 10) * 100}
                            strokeColor={scoreColor}
                            trailColor={token.colorFillSecondary}
                            showInfo={false}
                            size={['100%', 5]}
                            strokeLinecap="square"
                          />
                        </div>
                      </Flex>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                          columnGap: 28,
                          rowGap: 14,
                        }}
                      >
                        {dims.map((d) => {
                          const displayValue = d.value
                          const barValue = d.inverted ? 10 - d.value : d.value
                          const barColor =
                            barClass(barValue) === 'up' ? token.colorSuccess
                            : barClass(barValue) === 'mid' ? token.colorWarning
                            : token.colorError
                          return (
                            <div key={d.key}>
                              <Flex align="baseline" justify="space-between" style={{ marginBottom: 4 }}>
                                <Text
                                  title={t(d.hintKey)}
                                  style={{ fontSize: 12, color: token.colorTextSecondary }}
                                >
                                  {t(d.labelKey)}
                                  {d.inverted && (
                                    <span style={{ marginLeft: 4, color: token.colorTextQuaternary, fontSize: 10 }}>↓</span>
                                  )}
                                </Text>
                                <Text
                                  style={{
                                    fontFamily: token.fontFamilyCode,
                                    fontSize: 12,
                                    color: token.colorText,
                                  }}
                                >
                                  {displayValue.toFixed(1)}
                                </Text>
                              </Flex>
                              <Progress
                                percent={(barValue / 10) * 100}
                                strokeColor={barColor}
                                trailColor={token.colorFillSecondary}
                                showInfo={false}
                                size={['100%', 3]}
                                strokeLinecap="square"
                              />
                            </div>
                          )
                        })}
                      </div>

                      {reasoning && (
                        <Text
                          style={{
                            display: 'block',
                            marginTop: 18,
                            fontSize: 13,
                            lineHeight: 1.65,
                            color: token.colorTextSecondary,
                          }}
                        >
                          {reasoning}
                        </Text>
                      )}

                      <Flex
                        justify="space-between"
                        gap={12}
                        wrap
                        style={{
                          marginTop: 16,
                          paddingTop: 12,
                          borderTop: `1px solid ${token.colorSplit}`,
                          fontSize: 11,
                          color: token.colorTextTertiary,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontStyle: 'italic', color: token.colorTextTertiary }}>
                          ℹ {t('theme_detail.ai_subjective_disclaimer')}
                        </Text>
                        {theme.conviction_generated_at && (
                          <Text style={{ fontSize: 11, fontFamily: token.fontFamilyCode, color: token.colorTextQuaternary }}>
                            {t('theme_detail.conviction_last_computed', { label: formatRelativeTime(theme.conviction_generated_at, t, locale) })}
                          </Text>
                        )}
                      </Flex>
                    </Card>
                  </div>
                )
              })()}

              {/* Key Events Timeline (last 30 days) */}
              {(() => {
                const timelineEvents = catalysts
                  .filter((c) => c.days_ago <= 30)
                  .slice(0, 8)
                if (catalysts.length === 0) return null
                const formatTimelineDate = (iso: string) => {
                  const d = new Date(iso)
                  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
                }
                const dotColor = (dir: EventDirection | null) =>
                  dir === 'supports' ? token.colorSuccess
                  : dir === 'contradicts' ? token.colorError
                  : token.colorTextQuaternary

                return (
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.key_timeline_title')}
                      subtitle={t('sections.key_timeline_subtitle')}
                      meta={`${timelineEvents.length}`}
                    />
                    <Card size="small" styles={{ body: { padding: '20px 20px 16px' } }}>
                      {timelineEvents.length === 0 ? (
                        <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                          {t('sections.key_timeline_empty')}
                        </Text>
                      ) : (
                        <>
                          <div style={{ position: 'relative' }}>
                            <div
                              style={{
                                position: 'absolute',
                                top: 7,
                                left: 0,
                                right: 0,
                                height: 1,
                                background: token.colorSplit,
                              }}
                            />
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${timelineEvents.length}, minmax(0, 1fr))`,
                                gap: 12,
                                position: 'relative',
                              }}
                            >
                              {timelineEvents.map((e) => (
                                <div
                                  key={e.id}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    minWidth: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 14,
                                      height: 14,
                                      borderRadius: '50%',
                                      background: token.colorBgContainer,
                                      border: `2px solid ${dotColor(e.supports_or_contradicts)}`,
                                      boxSizing: 'border-box',
                                      zIndex: 1,
                                    }}
                                  />
                                  <Text
                                    style={{
                                      display: 'block',
                                      fontFamily: token.fontFamilyCode,
                                      fontSize: 11,
                                      color: token.colorTextTertiary,
                                      letterSpacing: '0.04em',
                                    }}
                                  >
                                    {formatTimelineDate(e.published_at)}
                                  </Text>
                                  {e.source_url ? (
                                    <a
                                      href={e.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ color: 'inherit', textDecoration: 'none' }}
                                    >
                                      <Text
                                        strong
                                        style={{
                                          display: '-webkit-box',
                                          WebkitLineClamp: 3,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                          fontSize: 12.5,
                                          color: token.colorText,
                                          lineHeight: 1.4,
                                        }}
                                      >
                                        {e.headline}
                                      </Text>
                                    </a>
                                  ) : (
                                    <Text
                                      strong
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        fontSize: 12.5,
                                        color: token.colorText,
                                        lineHeight: 1.4,
                                      }}
                                    >
                                      {e.headline}
                                    </Text>
                                  )}
                                  {e.source_name && (
                                    <Text
                                      style={{
                                        display: 'block',
                                        fontSize: 10.5,
                                        color: token.colorTextQuaternary,
                                        marginTop: 'auto',
                                      }}
                                    >
                                      {getDisplayPublisher(e.source_name, e.source_url)}
                                    </Text>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </Card>
                  </div>
                )
              })()}

              {/* Exposure Mapping */}
              <div style={{ marginTop: 32 }}>
                <SectionHeader
                  index={nextIdx()}
                  title={t('sections.theme_exposure_title')}
                  subtitle={t('sections.theme_exposure_subtitle')}
                />
                <Text
                  type="secondary"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    marginTop: 4,
                    marginBottom: 12,
                    color: token.colorTextTertiary,
                  }}
                >
                  {t('common.ai_disclaimer_short')}
                </Text>
                {recs.length === 0 && (
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>{t('theme_detail.no_exposure')}</Text>
                )}

                {tradableRecs.length > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 16,
                      alignItems: 'stretch',
                      marginBottom: 20,
                    }}
                  >
                    <TierColumn
                      tier={1}
                      title={t('theme_detail.tier1')}
                      subtitle={t('theme_detail.tier1_desc')}
                      items={tier1Recs}
                    />
                    <TierColumn
                      tier={2}
                      title={t('theme_detail.tier2')}
                      subtitle={t('theme_detail.tier2_desc')}
                      items={tier2Recs}
                    />
                    <TierColumn
                      tier={3}
                      title={t('theme_detail.tier3')}
                      subtitle={t('theme_detail.tier3_desc')}
                      items={tier3Recs}
                    />
                  </div>
                )}

                <ExposureGroup title={t('theme_detail.headwinds')} items={headwinds} variant="headwind" />
              </div>

              {/* Subthemes */}
              {theme.child_themes.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <SectionHeader
                    index={nextIdx()}
                    title={t('sections.theme_subthemes_title')}
                    subtitle={t('sections.theme_subthemes_subtitle')}
                    meta={`${theme.child_themes.length}`}
                  />
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                      gap: 16,
                      alignItems: 'stretch',
                    }}
                  >
                    {childThemeItems.length > 0
                      ? childThemeItems.map((child) => (
                          <ThemeCard key={child.id} theme={child} variant="secondary" />
                        ))
                      : theme.child_themes.map((c) => (
                          <Link
                            key={c.id}
                            href={`/themes/${c.id}`}
                            style={{ display: 'block', textDecoration: 'none', color: 'inherit', height: 320 }}
                          >
                            <Card
                              hoverable
                              styles={{ body: { padding: 20, height: '100%' } }}
                              style={{ height: '100%' }}
                            >
                              <Text strong style={{ display: 'block', fontSize: 16, color: token.colorText, marginBottom: 6 }}>
                                {pickField(locale, c.name, c.name_zh)}
                              </Text>
                              <Flex align="center" gap={8}>
                                <FocusLevelBadge strength={c.theme_strength_score} />
                                <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                                  {t('themes_list.events', { n: c.event_count })}
                                </Text>
                              </Flex>
                            </Card>
                          </Link>
                        ))}
                  </div>
                </div>
              )}

              {/* Historical Playbook */}
              {(theme.archetype_playbook?.historical_cases?.length ?? 0) > 0 && (() => {
                const pb = (locale === 'zh' && theme.archetype_playbook_zh?.historical_cases?.length
                  ? theme.archetype_playbook_zh
                  : theme.archetype_playbook) as NonNullable<typeof theme.archetype_playbook>
                const ttd = pb.this_time_different
                const allDiffs = (ttd?.differences ?? []).filter((d) => d.dimension && d.description)
                const highConfDiffs = allDiffs.filter((d) => d.confidence === 'high')
                const visibleDiffs = showAllDiffs ? allDiffs : highConfDiffs
                const hiddenCount = allDiffs.length - highConfDiffs.length
                const validSims = (ttd?.similarities ?? []).filter(
                  (s) => typeof s === 'object' && s !== null && s.dimension && s.description,
                ) as { dimension: string; description: string }[]

                const dimGroup = (dim: string) => {
                  if (dim === 'supply_side') return 'Supply'
                  if (dim === 'demand_side') return 'Demand'
                  if (dim === 'policy') return 'Policy'
                  if (dim === 'macro') return 'Macro'
                  if (dim === 'technology') return 'Technology'
                  return dim
                }

                const sublabelStyle: React.CSSProperties = {
                  fontFamily: token.fontFamilyCode,
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: token.colorTextTertiary,
                  margin: '14px 0 8px',
                }
                return (
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.theme_playbook_title')}
                      subtitle={t('sections.theme_playbook_subtitle')}
                    />

                    <Text
                      style={{
                        display: 'block',
                        fontFamily: token.fontFamilyCode,
                        fontSize: 10,
                        color: token.colorTextQuaternary,
                        letterSpacing: '0.06em',
                        marginBottom: 10,
                        fontStyle: 'italic',
                      }}
                    >
                      ℹ {t('theme_detail.disclaimer_playbook')}
                    </Text>

                    {ttd?.observation && (
                      <>
                        <div style={sublabelStyle}>{t('theme_detail.observation')}</div>
                        <Card
                          size="small"
                          styles={{ body: { padding: '14px 16px' } }}
                          style={{ background: token.colorFillAlter, borderColor: token.colorBorderSecondary }}
                        >
                          <Text
                            style={{
                              display: 'block',
                              fontSize: 12,
                              color: token.colorTextSecondary,
                              lineHeight: 1.6,
                            }}
                          >
                            {ttd.observation}
                          </Text>
                          <Text
                            style={{
                              display: 'block',
                              marginTop: 10,
                              fontFamily: token.fontFamilyCode,
                              fontSize: 10,
                              color: token.colorTextQuaternary,
                              letterSpacing: '0.06em',
                              fontStyle: 'italic',
                            }}
                          >
                            ⚠ {t('theme_detail.disclaimer_observation')}
                          </Text>
                        </Card>
                      </>
                    )}

                    <div style={sublabelStyle}>{t('theme_detail.historical_cases')}</div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 12,
                        alignItems: 'stretch',
                      }}
                    >
                      {pb.historical_cases.map((c, i) => {
                        const peakIsNegative = typeof c.peak_move === 'string' && c.peak_move.trim().startsWith('-')
                        const peakColor = peakIsNegative ? token.colorError : token.colorSuccess
                        return (
                          <Card
                            key={i}
                            size="small"
                            styles={{
                              body: {
                                padding: '14px 16px',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              },
                            }}
                            style={{ height: '100%' }}
                          >
                            <Text strong style={{ display: 'block', fontSize: 13, color: token.colorText, lineHeight: 1.35 }}>
                              {c.name}
                            </Text>
                            <Flex justify="space-between" align="center" gap={8}>
                              <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                                {t('theme_detail.duration_label')}
                              </Text>
                              <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 11.5, color: token.colorTextSecondary }}>
                                {c.approximate_duration}
                              </Text>
                            </Flex>
                            <Flex justify="space-between" align="center" gap={8}>
                              <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                                {t('theme_detail.peak_move_label')}
                              </Text>
                              <Text strong style={{ fontFamily: token.fontFamilyCode, fontSize: 12.5, color: peakColor }}>
                                {c.peak_move}
                              </Text>
                            </Flex>
                            {c.exit_trigger && (
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: token.colorTextQuaternary,
                                  lineHeight: 1.5,
                                  marginTop: 'auto',
                                  paddingTop: 6,
                                  borderTop: `1px solid ${token.colorSplit}`,
                                }}
                              >
                                {c.exit_trigger}
                              </Text>
                            )}
                          </Card>
                        )
                      })}

                      {(() => {
                        const stage = theme.playbook_stage
                        const stageLabel = stage === 'early' ? t('theme_detail.stage_early')
                          : stage === 'mid' ? t('theme_detail.stage_mid')
                          : stage === 'late' ? t('theme_detail.stage_late')
                          : stage === 'beyond' ? t('theme_detail.stage_beyond')
                          : null
                        const stageColor = stage === 'early' ? token.colorSuccess
                          : stage === 'mid' ? token.colorPrimary
                          : stage === 'late' ? token.colorWarning
                          : stage === 'beyond' ? token.colorError
                          : token.colorTextSecondary
                        const range = pb.typical_duration_days_approx
                        const dayUnit = locale === 'zh' ? '天' : 'd'
                        const positionPct = range && range[1] > 0
                          ? Math.min(100, Math.max(0, (theme.days_hot / range[1]) * 100))
                          : null
                        return (
                          <Card
                            size="small"
                            styles={{
                              body: {
                                padding: '14px 16px',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              },
                            }}
                            style={{
                              height: '100%',
                              borderColor: stageColor,
                              borderWidth: 1.5,
                              background: token.colorFillAlter,
                            }}
                          >
                            <Flex align="center" justify="space-between" gap={8}>
                              <Text strong style={{ fontSize: 13, color: token.colorText, lineHeight: 1.35 }}>
                                {t('theme_detail.current_stage_compare')}
                              </Text>
                              {stageLabel && (
                                <Tag
                                  style={{
                                    margin: 0,
                                    fontSize: 9.5,
                                    padding: '0 6px',
                                    border: 'none',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    fontFamily: token.fontFamilyCode,
                                    color: stageColor,
                                    background: token.colorFillSecondary,
                                  }}
                                >
                                  {stageLabel}
                                </Tag>
                              )}
                            </Flex>
                            <Flex justify="space-between" align="center" gap={8}>
                              <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                                {t('theme_detail.duration_label')}
                              </Text>
                              <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 11.5, color: token.colorTextSecondary }}>
                                {theme.days_hot}{dayUnit}{range ? ` / ${range[1]}${dayUnit}` : ''}
                              </Text>
                            </Flex>
                            {positionPct !== null && (
                              <div style={{ marginTop: 'auto' }}>
                                <div
                                  style={{
                                    width: '100%',
                                    height: 4,
                                    background: token.colorFillTertiary,
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${positionPct}%`,
                                      height: '100%',
                                      background: stageColor,
                                    }}
                                  />
                                </div>
                                <Text
                                  style={{
                                    display: 'block',
                                    marginTop: 4,
                                    fontFamily: token.fontFamilyCode,
                                    fontSize: 10,
                                    color: token.colorTextQuaternary,
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  {t('theme_detail.position_label')}: {Math.round(positionPct)}%
                                </Text>
                              </div>
                            )}
                          </Card>
                        )
                      })()}
                    </div>

                    {(visibleDiffs.length > 0 || validSims.length > 0) && (
                      <>
                        {visibleDiffs.length > 0 && (
                          <>
                            <div style={{ ...sublabelStyle, marginTop: 22 }}>{t('theme_detail.structural_differences')}</div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                                gap: 10,
                                alignItems: 'stretch',
                              }}
                            >
                              {visibleDiffs.map((d, i) => {
                                const arrow = d.direction === 'may_extend' ? '↑' : d.direction === 'may_shorten' ? '↓' : '⇅'
                                const arrColor =
                                  d.direction === 'may_extend' ? token.colorSuccess
                                  : d.direction === 'may_shorten' ? token.colorError
                                  : token.colorTextTertiary
                                const confTone = d.confidence === 'high'
                                  ? { color: token.colorSuccessText, background: token.colorSuccessBg }
                                  : { color: token.colorWarningText, background: token.colorWarningBg }
                                return (
                                  <Card
                                    key={i}
                                    size="small"
                                    styles={{
                                      body: {
                                        padding: '14px 16px',
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 6,
                                      },
                                    }}
                                    style={{ height: '100%' }}
                                  >
                                    <Flex align="center" gap={6}>
                                      <span style={{ fontSize: 14, lineHeight: 1, color: arrColor }}>{arrow}</span>
                                      <Text strong style={{ fontSize: 13, color: token.colorText, textTransform: 'capitalize', lineHeight: 1.35 }}>
                                        {dimGroup(d.dimension)}
                                      </Text>
                                      <Tag
                                        style={{
                                          margin: 0,
                                          marginLeft: 'auto',
                                          fontSize: 9.5,
                                          padding: '0 6px',
                                          border: 'none',
                                          letterSpacing: '0.08em',
                                          textTransform: 'uppercase',
                                          fontFamily: token.fontFamilyCode,
                                          ...confTone,
                                        }}
                                      >
                                        {d.confidence}
                                      </Tag>
                                    </Flex>
                                    <Text style={{ fontSize: 12, color: token.colorTextSecondary, lineHeight: 1.5 }}>
                                      {d.description}
                                    </Text>
                                  </Card>
                                )
                              })}
                            </div>
                            {!showAllDiffs && hiddenCount > 0 && (
                              <Button
                                type="link"
                                size="small"
                                onClick={() => setShowAllDiffs(true)}
                                style={{
                                  padding: 0,
                                  marginTop: 8,
                                  fontSize: 11,
                                  color: token.colorTextTertiary,
                                }}
                              >
                                {t('theme_detail.show_all_diffs')} ({hiddenCount} {t('theme_detail.more_medium_conf')})
                              </Button>
                            )}
                          </>
                        )}

                        {validSims.length > 0 && (
                          <>
                            <div style={{ ...sublabelStyle, marginTop: 22 }}>{t('theme_detail.similarities')}</div>
                            <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
                              <div style={{ display: 'grid', rowGap: 2 }}>
                                {validSims.map((s, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      fontSize: 12,
                                      color: token.colorTextSecondary,
                                      lineHeight: 1.6,
                                      padding: '6px 0',
                                      borderBottom: i === validSims.length - 1 ? 'none' : `1px solid ${token.colorSplit}`,
                                    }}
                                  >
                                    <span style={{ color: token.colorTextTertiary, fontWeight: 500, textTransform: 'capitalize' }}>
                                      {dimGroup(s.dimension)}
                                    </span>
                                    <span style={{ color: token.colorTextQuaternary, margin: '0 8px' }}>·</span>
                                    {s.description}
                                  </div>
                                ))}
                              </div>
                            </Card>
                          </>
                        )}
                      </>
                    )}

                    {(pb.exit_signals?.length ?? 0) > 0 && (
                      <>
                        <div style={{ ...sublabelStyle, marginTop: 22 }}>{t('theme_detail.exit_signals')}</div>
                        <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
                          <div style={{ display: 'grid', rowGap: 2 }}>
                            {pb.exit_signals.map((s, i) => (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 10,
                                  fontSize: 12.5,
                                  color: token.colorTextSecondary,
                                  padding: '7px 0',
                                  borderBottom: i === pb.exit_signals.length - 1 ? 'none' : `1px solid ${token.colorSplit}`,
                                }}
                              >
                                <span style={{ color: token.colorTextQuaternary, lineHeight: 1.5, flexShrink: 0 }}>·</span>
                                <span style={{ lineHeight: 1.5 }}>{s}</span>
                              </div>
                            ))}
                          </div>
                        </Card>
                      </>
                    )}
                  </div>
                )
              })()}

                </Col>
                <Col xs={24} lg={7}>
                  <div style={{ position: 'sticky', top: 80, marginTop: 32 }}>
                    <ThemeEventSidebar
                      catalysts={catalysts}
                      eventTab={eventTab}
                      setEventTab={setEventTab}
                      hasDirection={hasDirection}
                      eventCounts={eventCounts}
                      filteredEvents={filteredEvents}
                      showAllEvents={showAllEvents}
                      setShowAllEvents={setShowAllEvents}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                      sectionIndex={nextIdx()}
                      counterEvidence={theme.counter_evidence_summary}
                      isCooling={theme.status === 'cooling'}
                      daysHot={theme.days_hot}
                      daysSinceLastEvent={theme.days_since_last_event}
                    />
                  </div>
                </Col>
              </Row>

                <div style={{ marginTop: 32, padding: '16px 0', borderTop: `1px solid ${token.colorBorderSecondary}`, textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, color: token.colorTextQuaternary, letterSpacing: '0.02em' }}>
                    {t('common.ai_disclaimer_full')}
                  </Text>
                </div>
              </>
              )
            })()}
          </Content>
        </Layout>
      </div>
    </div>
  )
}

interface KPICellProps {
  label: string
  value: string | number
  token: ReturnType<typeof useToken>['token']
  tone?: 'up' | 'down'
}

function KPICell({ label, value, token, tone }: KPICellProps) {
  const color = tone === 'up' ? token.colorSuccess : tone === 'down' ? token.colorError : token.colorText
  return (
    <div>
      <div
        style={{
          fontFamily: token.fontFamilyCode,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: token.colorTextQuaternary,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: token.fontFamilyCode,
          fontSize: 22,
          fontWeight: 600,
          color,
          lineHeight: 1,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
    </div>
  )
}

const SIDEBAR_SRC_COLOR: Record<string, { bg: string; fg: string }> = {
  Reuters: { bg: '#FFEDD5', fg: '#C2410C' },
  Bloomberg: { bg: '#D1FAE5', fg: '#047857' },
  WSJ: { bg: '#EDE9FE', fg: '#6D28D9' },
  'Financial Times': { bg: '#FCE7F3', fg: '#BE185D' },
  CNBC: { bg: '#E0F2FE', fg: '#0369A1' },
  NYT: { bg: '#F4F4F5', fg: '#3F3F46' },
}

function shortPublisher(name: string): string {
  if (name === 'Financial Times') return 'FT'
  if (name === 'Nikkei Asia') return 'Nikkei'
  if (name === "Investor's Business Daily") return 'IBD'
  if (name === 'GlobeNewswire') return 'Globe'
  if (name === 'PR Newswire') return 'PRNews'
  if (name === 'BusinessWire') return 'BizWire'
  if (name.length > 10) return name.split(/\s+/)[0].slice(0, 10)
  return name
}

function ThemeEventSidebar({
  catalysts,
  eventTab,
  setEventTab,
  hasDirection,
  eventCounts,
  filteredEvents,
  showAllEvents,
  setShowAllEvents,
  expanded,
  toggleExpand,
  sectionIndex,
  counterEvidence,
  isCooling,
  daysHot,
  daysSinceLastEvent,
}: {
  catalysts: CatalystEvent[]
  eventTab: EventTab
  setEventTab: (v: EventTab) => void
  hasDirection: boolean
  eventCounts: Record<EventTab, number>
  filteredEvents: CatalystEvent[]
  showAllEvents: boolean
  setShowAllEvents: (fn: (v: boolean) => boolean) => void
  expanded: Set<string>
  toggleExpand: (id: string) => void
  sectionIndex: string
  counterEvidence: CounterEvidenceSummary | null
  isCooling: boolean
  daysHot: number
  daysSinceLastEvent: number
}) {
  const { t, locale } = useI18n()
  const { token } = useToken()

  const visibleEvents = showAllEvents ? filteredEvents : filteredEvents.slice(0, 8)

  const ev = counterEvidence
  const evTotal = ev ? ev.supports_count + ev.contradicts_count + ev.neutral_count : 0
  const evMax = ev ? Math.max(ev.supports_count, ev.contradicts_count, ev.neutral_count, 1) : 1
  const evRatio = ev
    ? ev.contradicts_count === 0
      ? ev.supports_count > 0 ? `${ev.supports_count}:0` : '—'
      : (ev.supports_count / ev.contradicts_count).toFixed(2) + ':1'
    : '—'
  const bearWarn = ev ? ev.contradicts_count > ev.supports_count : false
  const evRows = ev
    ? [
        { key: 'sup', color: token.colorSuccess, label: t('theme_detail.supports'), count: ev.supports_count },
        { key: 'con', color: token.colorError, label: t('theme_detail.contradicts'), count: ev.contradicts_count },
        { key: 'neu', color: token.colorTextQuaternary, label: t('theme_detail.neutral'), count: ev.neutral_count },
      ]
    : []
  const coolPct = Math.min(100, Math.max(0, Math.round(((daysSinceLastEvent - 30) / 30) * 100)))

  return (
    <>
      {isCooling && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            background: token.colorWarningBg,
            border: `1px solid ${token.colorWarningBorder}`,
            borderRadius: token.borderRadius,
          }}
        >
          <Text
            strong
            style={{
              display: 'block',
              fontSize: 12,
              color: token.colorWarningText,
              marginBottom: 2,
            }}
          >
            {t('theme_detail.cooling_banner_title', { n: daysHot })}
          </Text>
          <Text
            style={{
              display: 'block',
              fontSize: 11,
              color: token.colorWarningText,
              opacity: 0.85,
              marginBottom: 6,
            }}
          >
            {t('theme_detail.cooling_archive_hint', {
              n: daysSinceLastEvent,
              m: Math.max(0, 60 - daysSinceLastEvent),
            })}
          </Text>
          <Progress
            percent={coolPct}
            strokeColor={token.colorWarning}
            trailColor={token.colorWarningBgHover}
            showInfo={false}
            size={['100%', 3]}
            strokeLinecap="square"
          />
        </div>
      )}

      {ev && evTotal > 0 && (
        <Card size="small" styles={{ body: { padding: '12px 14px' } }} style={{ marginBottom: 12 }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
            <Text
              strong
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: token.colorTextTertiary,
              }}
            >
              {t('sections.sidebar_evidence_title')}
            </Text>
            <Text style={{ fontSize: 11, fontFamily: token.fontFamilyCode, color: token.colorTextSecondary }}>
              {evRatio}
            </Text>
          </Flex>
          {bearWarn && (
            <div
              style={{
                background: token.colorErrorBg,
                border: `1px solid ${token.colorErrorBorder}`,
                color: token.colorErrorText,
                padding: '6px 10px',
                borderRadius: token.borderRadius,
                fontSize: 11,
                marginBottom: 8,
              }}
            >
              ⚠ {t('theme_detail.bear_warning')}
            </div>
          )}
          <div style={{ display: 'grid', rowGap: 6 }}>
            {evRows.map((r) => (
              <div
                key={r.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr 24px',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 11,
                }}
              >
                <Flex align="center" gap={5} style={{ color: token.colorTextSecondary }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: r.color }} />
                  {r.label}
                </Flex>
                <Progress
                  percent={(r.count / evMax) * 100}
                  strokeColor={r.color}
                  trailColor={token.colorFillSecondary}
                  showInfo={false}
                  size={['100%', 3]}
                  strokeLinecap="square"
                />
                <Text
                  style={{
                    fontFamily: token.fontFamilyCode,
                    fontSize: 11,
                    color: token.colorTextSecondary,
                    textAlign: 'right',
                  }}
                >
                  {r.count}
                </Text>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SectionHeader
        size="sm"
        index={sectionIndex}
        title={t('sections.theme_events_title')}
        subtitle={t('sections.theme_events_subtitle')}
        meta={`${catalysts.length}`}
      />
      <Card size="small" styles={{ body: { padding: 0 } }}>
        {catalysts.length === 0 ? (
          <Text style={{ display: 'block', padding: '16px 14px', fontSize: 12, color: token.colorTextTertiary }}>
            {t('theme_detail.no_catalysts')}
          </Text>
        ) : (
          <>
            {hasDirection && (
              <div style={{ padding: '12px 14px 0' }}>
                <Segmented
                  size="small"
                  block
                  value={eventTab}
                  onChange={(v) => setEventTab(v as EventTab)}
                  options={(['all', 'supports', 'contradicts', 'neutral'] as EventTab[]).map((k) => ({
                    label: `${t(k === 'all' ? 'theme_detail.tab_all' : `theme_detail.${k}`)} ${eventCounts[k]}`,
                    value: k,
                  }))}
                />
              </div>
            )}

            {visibleEvents.length === 0 ? (
              <Text style={{ display: 'block', padding: '16px 14px', fontSize: 12, color: token.colorTextTertiary }}>
                {t('theme_detail.no_catalysts')}
              </Text>
            ) : (
              visibleEvents.map((c, idx) => {
                const publisher = getDisplayPublisher(c.source_name, c.source_url)
                const srcColors = SIDEBAR_SRC_COLOR[publisher]
                const reasoning = pickField(
                  locale,
                  c.counter_evidence_reasoning,
                  c.counter_evidence_reasoning_zh,
                )
                const isExp = expanded.has(c.id)
                const dir = dirDot(c.supports_or_contradicts)
                const dotColor =
                  dir === 'sup' ? token.colorSuccess
                  : dir === 'con' ? token.colorError
                  : token.colorTextQuaternary
                const timeAgo =
                  c.days_ago === 0
                    ? t('theme_detail.today')
                    : t('relative_time.days_ago', { n: c.days_ago })
                return (
                  <Flex
                    vertical
                    key={c.id}
                    gap={6}
                    style={{
                      padding: '12px 14px',
                      borderTop: idx === 0 && !hasDirection ? 'none' : `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Flex align="center" gap={8}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: dotColor,
                          flexShrink: 0,
                        }}
                      />
                      <Text
                        style={{
                          fontFamily: token.fontFamilyCode,
                          fontSize: 10.5,
                          color: token.colorTextTertiary,
                        }}
                      >
                        {timeAgo}
                      </Text>
                      <Tag
                        style={{
                          fontFamily: token.fontFamilyCode,
                          fontSize: 9.5,
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          margin: 0,
                          background: srcColors?.bg ?? token.colorFillTertiary,
                          color: srcColors?.fg ?? token.colorTextSecondary,
                          borderColor: 'transparent',
                        }}
                      >
                        {shortPublisher(publisher)}
                      </Tag>
                    </Flex>
                    {c.source_url ? (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: token.colorText,
                          fontSize: 12.5,
                          lineHeight: 1.4,
                          textDecoration: 'none',
                        }}
                      >
                        {c.headline}
                      </a>
                    ) : (
                      <Text style={{ color: token.colorText, fontSize: 12.5, lineHeight: 1.4 }}>
                        {c.headline}
                      </Text>
                    )}
                    {reasoning && (
                      <button
                        onClick={() => toggleExpand(c.id)}
                        style={{
                          alignSelf: 'flex-start',
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          color: token.colorTextTertiary,
                          fontSize: 11,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {isExp ? t('theme_detail.collapse') : t('theme_detail.counter_reasoning')}
                      </button>
                    )}
                    {isExp && reasoning && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: token.colorTextSecondary,
                          fontStyle: 'italic',
                          paddingLeft: 10,
                          borderLeft: `2px solid ${token.colorBorderSecondary}`,
                        }}
                      >
                        {reasoning}
                      </div>
                    )}
                  </Flex>
                )
              })
            )}

            {filteredEvents.length > 8 && (
              <div style={{ padding: '8px 14px 12px' }}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setShowAllEvents((v) => !v)}
                  style={{ padding: 0, fontSize: 12 }}
                >
                  {showAllEvents
                    ? t('theme_detail.collapse_events')
                    : t('theme_detail.view_all_events', { n: filteredEvents.length })}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <Text
        style={{
          display: 'block',
          fontFamily: token.fontFamilyCode,
          fontSize: 10,
          color: token.colorTextQuaternary,
          fontStyle: 'italic',
          marginTop: 10,
          letterSpacing: '0.06em',
        }}
      >
        ℹ {t('theme_detail.ai_source_hint')}
      </Text>
    </>
  )
}

function ExposureGroup({
  title,
  items,
  variant = 'default',
}: {
  title: string
  items: ThemeRecommendation[]
  variant?: 'default' | 'pressure' | 'headwind'
}) {
  const { t, locale } = useI18n()
  const { token } = useToken()
  if (items.length === 0) return null

  const wrapperStyle: React.CSSProperties =
    variant === 'headwind'
      ? {
          background: token.colorErrorBg,
          border: `1px solid ${token.colorErrorBorder}`,
          borderRadius: token.borderRadius,
          padding: '14px 16px',
          marginBottom: 16,
        }
      : variant === 'pressure'
      ? {
          background: token.colorWarningBg,
          border: `1px solid ${token.colorWarningBorder}`,
          borderRadius: token.borderRadius,
          padding: '14px 16px',
          marginBottom: 16,
        }
      : { marginBottom: 20 }

  const titleColor =
    variant === 'headwind' ? token.colorErrorText
    : variant === 'pressure' ? token.colorWarningText
    : token.colorTextSecondary

  return (
    <div style={wrapperStyle}>
      <Flex
        align="center"
        gap={6}
        style={{
          fontFamily: token.fontFamilyCode,
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: titleColor,
          marginBottom: 10,
        }}
      >
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ color: token.colorTextQuaternary, fontWeight: 400 }}>· {items.length}</span>
      </Flex>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 8,
        }}
      >
        {items.map((r) => {
          const reasoning = pickField(locale, r.role_reasoning, r.role_reasoning_zh)
          const exposure = pickField(locale, r.business_exposure, r.business_exposure_zh)
          const catalyst = pickField(locale, r.catalyst, r.catalyst_zh)
          const risk = pickField(locale, r.risk, r.risk_zh)
          const capLabel = r.market_cap_band === 'small' ? t('theme_detail.cap_small')
            : r.market_cap_band === 'mid' ? t('theme_detail.cap_mid')
            : r.market_cap_band === 'large' ? t('theme_detail.cap_large')
            : null
          const confTone =
            r.confidence_band === 'high'
              ? { color: token.colorSuccessText, background: token.colorSuccessBg }
              : r.confidence_band === 'medium'
              ? { color: token.colorWarningText, background: token.colorWarningBg }
              : { color: token.colorTextTertiary, background: token.colorFillTertiary }
          return (
            <Card
              key={r.ticker_symbol}
              size="small"
              styles={{ body: { padding: '12px 14px' } }}
            >
              <Flex align="center" gap={8} wrap style={{ marginBottom: reasoning.trim() ? 6 : 0 }}>
                <Link
                  href={`/tickers/${r.ticker_symbol}`}
                  style={{
                    fontFamily: token.fontFamilyCode,
                    fontWeight: 600,
                    fontSize: 13,
                    color: token.colorText,
                    textDecoration: 'none',
                  }}
                >
                  ${r.ticker_symbol}
                </Link>
                {r.company_name && r.company_name !== r.ticker_symbol && (
                  <Text style={{ fontSize: 11.5, color: token.colorTextTertiary }}>{r.company_name}</Text>
                )}
                <Flex gap={6} align="center" style={{ marginLeft: 'auto' }}>
                  {r.is_thematic_tool && (
                    <Tag
                      title={t('theme_detail.thematic_tool_tooltip')}
                      style={{
                        margin: 0,
                        fontSize: 10,
                        padding: '0 6px',
                        background: token.colorFillSecondary,
                        border: 'none',
                        color: token.colorText,
                      }}
                    >
                      💎
                    </Tag>
                  )}
                  {r.confidence_band && (
                    <Tag
                      style={{
                        margin: 0,
                        fontSize: 10,
                        padding: '0 6px',
                        border: 'none',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontFamily: token.fontFamilyCode,
                        ...confTone,
                      }}
                    >
                      {r.confidence_band}
                    </Tag>
                  )}
                  {capLabel && (
                    <Text style={{ fontSize: 10, color: token.colorTextQuaternary }}>{capLabel}</Text>
                  )}
                </Flex>
              </Flex>
              {reasoning.trim().length > 0 && (
                <Text style={{ display: 'block', fontSize: 12.5, lineHeight: 1.55, color: token.colorTextSecondary }}>
                  {reasoning}
                </Text>
              )}
              {(exposure.trim() || catalyst.trim() || risk.trim()) && (
                <div style={{ marginTop: 6, display: 'grid', rowGap: 3, fontSize: 11, color: token.colorTextTertiary }}>
                  {exposure.trim().length > 0 && (
                    <div>
                      <MetaKey token={token}>{t('theme_detail.exposure_label')}</MetaKey>
                      {exposure}
                    </div>
                  )}
                  {catalyst.trim().length > 0 && (
                    <div>
                      <MetaKey token={token} color={token.colorSuccessText}>{t('theme_detail.catalyst')}</MetaKey>
                      {catalyst}
                    </div>
                  )}
                  {risk.trim().length > 0 && (
                    <div>
                      <MetaKey token={token} color={token.colorErrorText}>{t('theme_detail.risk')}</MetaKey>
                      {risk}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function MetaKey({
  children,
  token,
  color,
}: {
  children: React.ReactNode
  token: ReturnType<typeof useToken>['token']
  color?: string
}) {
  return (
    <span
      style={{
        fontFamily: token.fontFamilyCode,
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: color ?? token.colorTextQuaternary,
        marginRight: 6,
      }}
    >
      {children}
    </span>
  )
}

function TierColumn({
  tier,
  title,
  subtitle,
  items,
}: {
  tier: 1 | 2 | 3
  title: string
  subtitle: string
  items: ThemeRecommendation[]
}) {
  const { t } = useI18n()
  const { token } = useToken()
  const [expanded, setExpanded] = useState(false)
  const COLLAPSED_LIMIT = 4

  const tierColor =
    tier === 1 ? token.colorSuccess
    : tier === 2 ? token.colorPrimary
    : token.colorTextTertiary

  const visible = expanded ? items : items.slice(0, COLLAPSED_LIMIT)
  const hasMore = items.length > COLLAPSED_LIMIT

  return (
    <Card
      size="small"
      styles={{
        body: {
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          height: '100%',
        },
      }}
      style={{ height: '100%' }}
    >
      <div>
        <Flex align="center" gap={8} style={{ marginBottom: 4 }}>
          <span
            style={{
              fontFamily: token.fontFamilyCode,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: tierColor,
            }}
          >
            Tier {tier}
          </span>
          <Text strong style={{ fontSize: 13.5, color: token.colorText }}>
            {title}
          </Text>
        </Flex>
        <Text style={{ display: 'block', fontSize: 11.5, color: token.colorTextTertiary, lineHeight: 1.5 }}>
          {subtitle}
        </Text>
      </div>

      {items.length === 0 ? (
        <Text
          style={{
            fontSize: 11,
            fontStyle: 'italic',
            color: token.colorTextQuaternary,
            padding: '8px 2px',
          }}
        >
          {t('theme_detail.no_exposure')}
        </Text>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {visible.map((r) => (
            <TickerTile key={r.ticker_symbol} item={r} tierColor={tierColor} />
          ))}
        </div>
      )}

      {hasMore && !expanded && (
        <Button
          type="link"
          size="small"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 'auto',
            padding: 0,
            height: 'auto',
            fontSize: 12,
            color: token.colorTextSecondary,
          }}
        >
          {t('theme_detail.view_all_tickers').replace('{n}', String(items.length))}
        </Button>
      )}
    </Card>
  )
}

function TickerTile({ item, tierColor }: { item: ThemeRecommendation; tierColor: string }) {
  const { t } = useI18n()
  const { token } = useToken()
  const [imgError, setImgError] = useState(false)

  const confLabel =
    item.confidence_band === 'high' ? t('theme_detail.confidence_strong')
    : item.confidence_band === 'medium' ? t('theme_detail.confidence_moderate')
    : t('theme_detail.confidence_medium')

  const confTextColor =
    item.confidence_band === 'high' ? token.colorSuccessText
    : item.confidence_band === 'medium' ? token.colorWarningText
    : token.colorTextSecondary
  const confBg =
    item.confidence_band === 'high' ? token.colorSuccessBg
    : item.confidence_band === 'medium' ? token.colorWarningBg
    : token.colorFillSecondary

  const confNum = typeof item.confidence === 'number' ? Math.round(item.confidence) : null

  const initials = item.ticker_symbol.slice(0, 1)

  return (
    <Link
      href={`/tickers/${item.ticker_symbol}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}
    >
      <div
        style={{
          padding: '10px 12px',
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadius,
          background: token.colorBgContainer,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          height: '100%',
        }}
      >
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          {item.logo_url && !imgError ? (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: token.colorFillAlter,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.logo_url}
                alt={item.ticker_symbol}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={() => setImgError(true)}
              />
            </div>
          ) : (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: token.colorFillSecondary,
                color: tierColor,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: token.fontFamilyCode,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text
              strong
              style={{
                display: 'block',
                fontFamily: token.fontFamilyCode,
                fontSize: 13,
                color: token.colorText,
                lineHeight: 1.2,
              }}
            >
              {item.ticker_symbol}
            </Text>
            {item.company_name && item.company_name !== item.ticker_symbol && (
              <Text
                ellipsis={{ tooltip: item.company_name }}
                style={{
                  display: 'block',
                  fontSize: 10.5,
                  color: token.colorTextTertiary,
                  lineHeight: 1.3,
                  marginTop: 1,
                }}
              >
                {item.company_name}
              </Text>
            )}
          </div>
          {item.is_thematic_tool && (
            <Tag
              title={t('theme_detail.thematic_tool_tooltip')}
              style={{
                margin: 0,
                fontSize: 10,
                padding: '0 4px',
                lineHeight: '14px',
                background: token.colorFillSecondary,
                border: 'none',
                color: token.colorText,
              }}
            >
              💎
            </Tag>
          )}
        </Flex>

        <Flex align="center" justify="space-between" style={{ marginTop: 'auto' }}>
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: token.borderRadiusSM,
              background: confBg,
              color: confTextColor,
              fontWeight: 500,
              lineHeight: '16px',
            }}
          >
            {confLabel}
          </span>
          {confNum !== null && (
            <Text
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: 12,
                fontWeight: 500,
                color: token.colorTextSecondary,
              }}
            >
              {confNum}
            </Text>
          )}
        </Flex>
      </div>
    </Link>
  )
}
