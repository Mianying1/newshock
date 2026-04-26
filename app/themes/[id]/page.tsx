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
  Grid,
  Input,
  Layout,
  Progress,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme as antdTheme,
} from 'antd'
import {
  ApiOutlined,
  BankOutlined,
  BuildOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  LineChartOutlined,
  MoonOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SunOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { pickField } from '@/lib/useField'
import { formatRelativeTime } from '@/lib/utils'
import { formatCategoryLabel } from '@/lib/theme-formatter'
import { getDisplayPublisher } from '@/lib/source-display'
import type {
  CatalystEvent,
  DriverIcon,
  EventDirection,
  RecentDriver,
  ThemeRadarItem,
  ThemeRecommendation,
} from '@/types/recommendations'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'
import { FilterPill } from '@/components/shared/FilterPill'
import { HorizonBadge } from '@/components/shared/HorizonBadge'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { ThemeCard } from '@/components/radar/ThemeCard'
import { stageColor as getStageColor } from '@/lib/design-tokens'
import '../../radar.css'

const { Title, Text } = Typography
const { Header, Content } = Layout
const { useToken } = antdTheme
const { useBreakpoint } = Grid

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

function HalfGauge({
  pct,
  color,
  trail,
  size = 160,
  stroke = 8,
  children,
}: {
  pct: number
  color: string
  trail: string
  size?: number
  stroke?: number
  children: React.ReactNode
}) {
  const radius = (size - stroke) / 2
  const arcLength = Math.PI * radius
  const progressLength = (Math.min(100, Math.max(0, pct)) / 100) * arcLength
  const cy = size / 2
  const path = `M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size / 2 + stroke,
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size / 2 + stroke}
        viewBox={`0 0 ${size} ${size / 2 + stroke}`}
        style={{ display: 'block' }}
      >
        <path d={path} fill="none" stroke={trail} strokeWidth={stroke} strokeLinecap="round" />
        {pct > 0 && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${progressLength} ${arcLength}`}
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: stroke + 2,
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default function ThemeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const screens = useBreakpoint()
  const { mode, toggle } = useThemeMode()
  const [theme, setTheme] = useState<ThemeRadarItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
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
          <Topbar sidePad={28} />

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
                    <HorizonBadge typicalDurationDaysUpper={theme.archetype_playbook?.typical_duration_days_approx?.[1]} />
                    <FocusLevelBadge strength={theme.theme_strength_score} />
                    {theme.parent_theme && (
                      <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                        {t('theme_detail.parent_theme')}{' '}
                        <Link href={`/themes/${theme.parent_theme.id}`} style={{ color: token.colorLink, textDecoration: 'none' }}>
                          {pickField(locale, theme.parent_theme.name, theme.parent_theme.name_zh)}
                        </Link>
                      </Text>
                    )}
                  </Flex>

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

                {/* Card 1 — Stage (left) + Conviction (right): cycle context + AI confidence in this cycle */}
                {(() => {
                  const pb = theme.archetype_playbook
                  const daysMax = pb?.typical_duration_days_approx?.[1] || 0
                  const progressPct = daysMax > 0
                    ? Math.min(100, Math.max(0, Math.round((theme.days_hot / daysMax) * 100)))
                    : 0
                  const hasConviction = theme.conviction_score !== null && theme.conviction_breakdown
                  const score = hasConviction ? theme.conviction_score! : 0
                  const b = theme.conviction_breakdown
                  const band = hasConviction ? convictionBand(score) : 'low'
                  const bandLabel = hasConviction ? t(`theme_detail.conviction_${band}`) : ''
                  const reasoning = hasConviction
                    ? pickField(locale, theme.conviction_reasoning, theme.conviction_reasoning_zh)
                    : null
                  const dims = hasConviction && b ? [
                    { key: 'hf', labelKey: 'theme_detail.historical_fit', hintKey: 'theme_detail.historical_fit_hint', value: b.historical_fit, inverted: false },
                    { key: 'es', labelKey: 'theme_detail.evidence_strength', hintKey: 'theme_detail.evidence_strength_hint', value: b.evidence_strength, inverted: false },
                    { key: 'pr', labelKey: 'theme_detail.priced_in_risk', hintKey: 'theme_detail.priced_in_risk_hint', value: b.priced_in_risk, inverted: true },
                    { key: 'ed', labelKey: 'theme_detail.exit_signal_distance', hintKey: 'theme_detail.exit_signal_distance_hint', value: b.exit_signal_distance, inverted: false },
                  ] : []
                  const scoreColor = hasConviction
                    ? (barClass(score) === 'up' ? token.colorSuccess
                       : barClass(score) === 'mid' ? token.colorWarning
                       : token.colorError)
                    : token.colorText

                  return (
                    <Card
                      size="small"
                      styles={{ body: { padding: '24px 28px' } }}
                      style={{ marginTop: 20 }}
                    >
                      {/* Top — Conviction: gauge LEFT (35%), content RIGHT (65%) */}
                      {hasConviction && (
                        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${token.colorSplit}` }}>
                          <Row gutter={[16, 20]} align="middle">
                            <Col xs={24} lg={6}>
                              <Flex vertical align="center" gap={10}>
                                <HalfGauge
                                  pct={(score / 10) * 100}
                                  color={scoreColor}
                                  trail={token.colorFillSecondary}
                                  size={160}
                                >
                                  <Flex align="baseline" justify="center" gap={2}>
                                    <span
                                      style={{
                                        fontFamily: token.fontFamilyCode,
                                        fontSize: 32,
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
                                </HalfGauge>
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: scoreColor,
                                    letterSpacing: '0.02em',
                                  }}
                                >
                                  {bandLabel}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: token.colorTextTertiary,
                                    textAlign: 'center',
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {t('sections.theme_conviction_subtitle')}
                                </Text>
                              </Flex>
                            </Col>
                            <Col
                              xs={24}
                              lg={18}
                              style={
                                screens.lg
                                  ? { paddingLeft: 24 }
                                  : { paddingTop: 20 }
                              }
                            >
                              <Row gutter={[20, 14]}>
                                {dims.map((d) => {
                                  const barValue = d.inverted ? 10 - d.value : d.value
                                  const displayValue = barValue
                                  const barColor =
                                    barClass(barValue) === 'up' ? token.colorSuccess
                                    : barClass(barValue) === 'mid' ? token.colorWarning
                                    : token.colorError
                                  return (
                                    <Col key={d.key} xs={12} md={12}>
                                      <Flex align="baseline" justify="space-between" style={{ marginBottom: 4 }}>
                                        <Text
                                          title={t(d.hintKey)}
                                          style={{ fontSize: 12, color: token.colorTextSecondary }}
                                        >
                                          {t(d.labelKey)}
                                        </Text>
                                        <Text
                                          style={{
                                            fontFamily: token.fontFamilyCode,
                                            fontSize: 12,
                                            fontWeight: 600,
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
                                        size={['100%', 4]}
                                        strokeLinecap="square"
                                      />
                                    </Col>
                                  )
                                })}
                              </Row>

                              {reasoning && (
                                <Text
                                  style={{
                                    display: 'block',
                                    marginTop: 16,
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
                                style={{ marginTop: 14 }}
                              >
                                <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                                  ℹ {t('theme_detail.ai_subjective_disclaimer')}
                                </Text>
                                {theme.conviction_generated_at && (
                                  <Text style={{ fontSize: 11, fontFamily: token.fontFamilyCode, color: token.colorTextQuaternary }}>
                                    {t('theme_detail.conviction_last_computed', { label: formatRelativeTime(theme.conviction_generated_at, t, locale) })}
                                  </Text>
                                )}
                              </Flex>
                            </Col>
                          </Row>
                        </div>
                      )}

                      {/* Bottom — Stage cycle: 4 segmented progress bars per stage range */}
                      {(() => {
                        const stageSegments = [
                          { key: 'early', lo: 0, hi: 30, label: t('theme_card.stage_early'), rangeLabel: t('theme_detail.stage_early_range') },
                          { key: 'mid', lo: 30, hi: 70, label: t('theme_card.stage_mid'), rangeLabel: t('theme_detail.stage_mid_range') },
                          { key: 'late', lo: 70, hi: 90, label: t('theme_card.stage_late'), rangeLabel: t('theme_detail.stage_late_range') },
                          { key: 'beyond', lo: 90, hi: 100, label: t('theme_card.stage_beyond'), rangeLabel: t('theme_detail.stage_exit_range') },
                        ]
                        return (
                          <div>
                            <Flex
                              align="flex-end"
                              justify="space-between"
                              wrap
                              gap={16}
                              style={{ marginBottom: 18 }}
                            >
                              <div>
                                <Text
                                  style={{
                                    display: 'block',
                                    fontSize: 10,
                                    color: token.colorTextQuaternary,
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    marginBottom: 4,
                                  }}
                                >
                                  {t('theme_detail.estimated_duration_label')}
                                </Text>
                                <Flex align="baseline" gap={8}>
                                  <Text
                                    style={{
                                      fontFamily: token.fontFamilyCode,
                                      fontSize: 24,
                                      fontWeight: 600,
                                      lineHeight: 1,
                                      color: token.colorText,
                                      letterSpacing: '-0.02em',
                                    }}
                                  >
                                    {theme.days_hot}
                                  </Text>
                                  {daysMax > 0 && (
                                    <Text
                                      style={{
                                        fontFamily: token.fontFamilyCode,
                                        fontSize: 14,
                                        color: token.colorTextQuaternary,
                                        lineHeight: 1,
                                      }}
                                    >
                                      / ~{daysMax}
                                    </Text>
                                  )}
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: token.colorTextTertiary,
                                      letterSpacing: '0.04em',
                                      lineHeight: 1,
                                    }}
                                  >
                                    {t('theme_detail.duration_unit_days')}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      color: token.colorTextQuaternary,
                                      lineHeight: 1,
                                      marginLeft: 4,
                                    }}
                                  >
                                    ·
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      color: token.colorTextSecondary,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {t('theme_detail.of_cycle_complete', { pct: progressPct })}
                                  </Text>
                                </Flex>
                              </div>
                            </Flex>
                            <Row gutter={12}>
                              {stageSegments.map((seg) => {
                                const isPast = progressPct >= seg.hi
                                const isActive = progressPct >= seg.lo && progressPct < seg.hi
                                const fillPct = isPast
                                  ? 100
                                  : isActive
                                    ? Math.round(((progressPct - seg.lo) / (seg.hi - seg.lo)) * 100)
                                    : 0
                                return (
                                  <Col key={seg.key} xs={12} md={6}>
                                    <Flex align="baseline" justify="space-between" style={{ marginBottom: 6 }}>
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          fontWeight: isActive ? 600 : 500,
                                          color: isActive ? token.colorText : token.colorTextTertiary,
                                          letterSpacing: '0.02em',
                                        }}
                                      >
                                        {seg.label}
                                      </Text>
                                      <Text
                                        style={{
                                          fontFamily: token.fontFamilyCode,
                                          fontSize: 10,
                                          color: token.colorTextQuaternary,
                                          letterSpacing: '0.04em',
                                        }}
                                      >
                                        {seg.rangeLabel}
                                      </Text>
                                    </Flex>
                                    <Progress
                                      percent={fillPct}
                                      strokeColor={token.colorText}
                                      trailColor={token.colorFillSecondary}
                                      showInfo={false}
                                      size={['100%', 4]}
                                      strokeLinecap="square"
                                      style={{ marginBottom: 0 }}
                                    />
                                  </Col>
                                )
                              })}
                            </Row>
                          </div>
                        )
                      })()}
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
                      title: pickField(locale, d.title, d.title_zh) || d.title,
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
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 16,
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
                              fontSize: 14,
                              color: token.colorText,
                              lineHeight: 1.5,
                            }}
                          >
                            {c.title}
                          </Text>
                        )
                        return (
                          <Card
                            key={c.key}
                            hoverable={!!c.href}
                            styles={{
                              body: {
                                padding: 20,
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                              },
                            }}
                            style={{ height: '100%' }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: token.borderRadius,
                                background: token.colorFillSecondary,
                                color: token.colorText,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18,
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
                                  fontSize: 13,
                                  color: token.colorTextSecondary,
                                  lineHeight: 1.6,
                                }}
                              >
                                {c.description}
                              </Text>
                            ) : null}
                            <Text
                              style={{
                                display: 'block',
                                fontFamily: token.fontFamilyCode,
                                fontSize: 11,
                                color: token.colorTextQuaternary,
                                letterSpacing: '0.06em',
                                marginTop: 'auto',
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


              {/* Key Events Timeline (last 30 days) */}
              {(() => {
                const timelineEvents = catalysts
                  .filter((c) => c.days_ago <= 30)
                  .slice(0, 5)
                  .slice()
                  .reverse()
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
                              {timelineEvents.map((e, i) => {
                                const zhHeadline =
                                  locale === 'zh' ? e.short_headline_zh : null
                                const enHeadline = e.short_headline || e.headline
                                const shortHeadline = zhHeadline || enHeadline
                                const isUntranslated = locale === 'zh' && !zhHeadline
                                const isLatest = i === timelineEvents.length - 1
                                return (
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
                                    className={isLatest ? 'timeline-dot-latest' : undefined}
                                    style={{
                                      width: 14,
                                      height: 14,
                                      borderRadius: '50%',
                                      background: isLatest
                                        ? token.colorText
                                        : token.colorBgContainer,
                                      border: `2px solid ${
                                        isLatest ? token.colorText : dotColor(e.supports_or_contradicts)
                                      }`,
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
                                      title={e.headline}
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
                                          color: isUntranslated
                                            ? token.colorTextSecondary
                                            : token.colorText,
                                          lineHeight: 1.4,
                                        }}
                                      >
                                        {isUntranslated && (
                                          <span
                                            style={{
                                              display: 'inline-block',
                                              fontSize: 9,
                                              fontWeight: 600,
                                              letterSpacing: '0.1em',
                                              color: token.colorTextQuaternary,
                                              border: `1px solid ${token.colorBorderSecondary}`,
                                              borderRadius: 3,
                                              padding: '0 4px',
                                              marginRight: 6,
                                              verticalAlign: 'middle',
                                              lineHeight: 1.4,
                                              fontFamily: token.fontFamilyCode,
                                            }}
                                          >
                                            EN
                                          </span>
                                        )}
                                        {shortHeadline}
                                      </Text>
                                    </a>
                                  ) : (
                                    <Text
                                      strong
                                      title={e.headline}
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        fontSize: 12.5,
                                        color: isUntranslated
                                          ? token.colorTextSecondary
                                          : token.colorText,
                                        lineHeight: 1.4,
                                      }}
                                    >
                                      {isUntranslated && (
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            fontSize: 9,
                                            fontWeight: 600,
                                            letterSpacing: '0.1em',
                                            color: token.colorTextQuaternary,
                                            border: `1px solid ${token.colorBorderSecondary}`,
                                            borderRadius: 3,
                                            padding: '0 4px',
                                            marginRight: 6,
                                            verticalAlign: 'middle',
                                            lineHeight: 1.4,
                                            fontFamily: token.fontFamilyCode,
                                          }}
                                        >
                                          EN
                                        </span>
                                      )}
                                      {shortHeadline}
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
                                )
                              })}
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
                  meta={t('common.ai_disclaimer_short')}
                />
                {recs.length === 0 && (
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>{t('theme_detail.no_exposure')}</Text>
                )}

                {tradableRecs.length > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
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
                    {tier3Recs.length > 0 && (
                      <TierColumn
                        tier={3}
                        title={t('theme_detail.tier3')}
                        subtitle={t('theme_detail.tier3_desc')}
                        items={tier3Recs}
                      />
                    )}
                  </div>
                )}

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
                      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
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
              {((theme.archetype_playbook?.historical_cases?.length ?? 0) > 0 ||
                (theme.archetype_playbook_zh?.historical_cases?.length ?? 0) > 0) && (() => {
                const pbForLocale =
                  locale === 'zh'
                    ? theme.archetype_playbook_zh ?? theme.archetype_playbook
                    : theme.archetype_playbook ?? theme.archetype_playbook_zh
                const hasLocaleVersion =
                  locale === 'zh'
                    ? (theme.archetype_playbook_zh?.historical_cases?.length ?? 0) > 0
                    : (theme.archetype_playbook?.historical_cases?.length ?? 0) > 0
                const pb = pbForLocale as NonNullable<typeof theme.archetype_playbook>
                const ttd = pb.this_time_different
                const allDiffs = (ttd?.differences ?? []).filter((d) => d.dimension && d.description)
                const highConfDiffs = allDiffs.filter((d) => d.confidence === 'high')
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
                const isThemeSpecific = theme.playbook_source === 'theme'
                return (
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.theme_playbook_title')}
                      subtitle={t('sections.theme_playbook_subtitle')}
                      meta={t('common.ai_disclaimer_short')}
                      action={
                        <Tag
                          style={{
                            margin: 0,
                            fontFamily: token.fontFamilyCode,
                            fontSize: 10,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                          }}
                          color={isThemeSpecific ? 'geekblue' : 'default'}
                        >
                          {isThemeSpecific
                            ? t('theme_detail.playbook_source_theme')
                            : t('theme_detail.playbook_source_archetype')}
                        </Tag>
                      }
                    />

                    {!hasLocaleVersion && (
                      <Card
                        size="small"
                        styles={{ body: { padding: '12px 14px' } }}
                        style={{
                          background: token.colorFillAlter,
                          borderColor: token.colorBorderSecondary,
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: token.colorTextSecondary,
                            lineHeight: 1.5,
                          }}
                        >
                          {t('theme_detail.playbook_locale_unavailable')}
                        </Text>
                      </Card>
                    )}

                    {hasLocaleVersion && (
                    <>
                    {ttd?.observation && (
                      <Card
                        size="small"
                        styles={{ body: { padding: '12px 14px' } }}
                        style={{ background: token.colorFillAlter, borderColor: token.colorBorderSecondary, marginBottom: 4 }}
                      >
                        <Text
                          style={{
                            display: 'block',
                            fontFamily: token.fontFamilyCode,
                            fontSize: 10,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: token.colorTextQuaternary,
                            marginBottom: 6,
                          }}
                        >
                          {t('theme_detail.observation')}
                        </Text>
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
                      </Card>
                    )}

                    <div style={sublabelStyle}>{t('theme_detail.historical_cases')}</div>
                    <div
                      className="scroll-x-hidden"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${pb.historical_cases.length + 1}, minmax(240px, 1fr))`,
                        gap: 12,
                        alignItems: 'stretch',
                        overflowX: 'auto',
                        paddingBottom: 4,
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
                                gap: 12,
                                overflow: 'hidden',
                                minWidth: 0,
                              },
                            }}
                            style={{ height: '100%', overflow: 'hidden', minWidth: 0 }}
                          >
                            <Text
                              strong
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                fontSize: 13,
                                color: token.colorText,
                                lineHeight: 1.4,
                                minHeight: 'calc(13px * 1.4 * 2)',
                                wordBreak: 'break-word',
                              }}
                              title={c.name}
                            >
                              {c.name}
                            </Text>
                            <span
                              style={{
                                alignSelf: 'flex-start',
                                maxWidth: '100%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '3px 10px',
                                borderRadius: 12,
                                background: token.colorFillTertiary,
                                color: token.colorTextSecondary,
                                fontSize: 11,
                                fontFamily: token.fontFamilyCode,
                                lineHeight: 1.4,
                                wordBreak: 'break-word',
                              }}
                              title={t('theme_detail.duration_label')}
                            >
                              <ClockCircleOutlined style={{ fontSize: 10, color: token.colorTextTertiary, flexShrink: 0 }} />
                              <span>{c.approximate_duration}</span>
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  letterSpacing: locale === 'zh' ? '0.08em' : '0.16em',
                                  textTransform: 'uppercase',
                                  color: token.colorTextQuaternary,
                                }}
                              >
                                {t('theme_detail.peak_move_label')}
                              </Text>
                              <Text
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 5,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  minHeight: 'calc(12px * 1.55 * 5)',
                                  fontSize: 12,
                                  color: peakColor,
                                  lineHeight: 1.55,
                                  fontWeight: 500,
                                  wordBreak: 'break-word',
                                  overflowWrap: 'anywhere',
                                }}
                                title={c.peak_move}
                              >
                                {c.peak_move}
                              </Text>
                            </div>
                            {c.exit_trigger && (
                              <div
                                style={{
                                  marginTop: 'auto',
                                  paddingTop: 10,
                                  borderTop: `1px solid ${token.colorSplit}`,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 4,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    letterSpacing: locale === 'zh' ? '0.08em' : '0.16em',
                                    textTransform: 'uppercase',
                                    color: token.colorTextQuaternary,
                                  }}
                                >
                                  {t('theme_detail.exit_reason_label')}
                                </Text>
                                <Text
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 4,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    fontSize: 12,
                                    color: token.colorTextSecondary,
                                    lineHeight: 1.55,
                                    wordBreak: 'break-word',
                                    overflowWrap: 'anywhere',
                                  }}
                                  title={c.exit_trigger}
                                >
                                  {c.exit_trigger}
                                </Text>
                              </div>
                            )}
                          </Card>
                        )
                      })}

                      {(() => {
                        const stage = theme.playbook_stage
                        const stageLabel = stage === 'early' ? t('theme_card.stage_early')
                          : stage === 'mid' ? t('theme_card.stage_mid')
                          : stage === 'late' ? t('theme_card.stage_late')
                          : stage === 'beyond' ? t('theme_card.stage_beyond')
                          : null
                        const stageColor = getStageColor(stage)
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
                                padding: '12px 14px 12px 16px',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              },
                            }}
                            style={{
                              height: '100%',
                              borderColor: token.colorBorder,
                              borderLeft: `3px solid ${stageColor}`,
                              background: token.colorBgContainer,
                              position: 'relative',
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                top: -1,
                                right: -1,
                                padding: '2px 8px',
                                fontSize: 9.5,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                fontFamily: token.fontFamilyCode,
                                fontWeight: 700,
                                color: token.colorBgContainer,
                                background: token.colorText,
                                borderTopRightRadius: token.borderRadiusLG,
                                borderBottomLeftRadius: token.borderRadiusLG,
                              }}
                            >
                              {t('theme_detail.current_badge')}
                            </div>
                            <Text
                              strong
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                fontSize: 13,
                                color: token.colorText,
                                lineHeight: 1.4,
                                paddingRight: 48,
                                wordBreak: 'break-word',
                              }}
                              title={locale === 'zh' ? (theme.name_zh || theme.name) : theme.name}
                            >
                              {locale === 'zh' ? (theme.name_zh || theme.name) : theme.name}
                            </Text>
                            <span
                              style={{
                                alignSelf: 'flex-start',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '3px 9px',
                                borderRadius: 999,
                                background: token.colorFillTertiary,
                                color: token.colorTextSecondary,
                                fontSize: 11,
                                fontFamily: token.fontFamilyCode,
                                lineHeight: 1.3,
                                whiteSpace: 'nowrap',
                              }}
                              title={t('theme_detail.duration_label')}
                            >
                              <ClockCircleOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
                              Day {theme.days_hot}{range ? ` / ${range[1]}${dayUnit}` : ''}
                            </span>
                            {stageLabel && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    letterSpacing: locale === 'zh' ? '0.08em' : '0.16em',
                                    textTransform: 'uppercase',
                                    color: token.colorTextQuaternary,
                                  }}
                                >
                                  {t('theme_detail.current_stage')}
                                </Text>
                                <span
                                  style={{
                                    alignSelf: 'flex-start',
                                    fontFamily: token.fontFamilyCode,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: '0.06em',
                                    color: stageColor,
                                    background: `${stageColor}1A`,
                                    padding: '2px 9px',
                                    borderRadius: 4,
                                  }}
                                >
                                  {stageLabel}
                                </span>
                              </div>
                            )}
                            {(() => {
                              const summary = pickField(locale, theme.summary, theme.summary_zh)
                              if (!summary) return null
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <Text
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      letterSpacing: locale === 'zh' ? '0.08em' : '0.16em',
                                      textTransform: 'uppercase',
                                      color: token.colorTextQuaternary,
                                    }}
                                  >
                                    {t('theme_detail.current_summary')}
                                  </Text>
                                  <Text
                                    style={{
                                      display: '-webkit-box',
                                      WebkitLineClamp: 6,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                      fontSize: 12,
                                      color: token.colorTextSecondary,
                                      lineHeight: 1.55,
                                      wordBreak: 'break-word',
                                      overflowWrap: 'anywhere',
                                    }}
                                    title={summary}
                                  >
                                    {summary}
                                  </Text>
                                </div>
                              )
                            })()}
                            {positionPct !== null && (
                              <div
                                style={{
                                  marginTop: 'auto',
                                  paddingTop: 10,
                                  borderTop: `1px solid ${token.colorSplit}`,
                                }}
                              >
                                <Flex justify="space-between" align="baseline" style={{ marginBottom: 5 }}>
                                  <Text
                                    style={{
                                      fontFamily: token.fontFamilyCode,
                                      fontSize: 9.5,
                                      letterSpacing: '0.1em',
                                      textTransform: 'uppercase',
                                      color: token.colorTextQuaternary,
                                    }}
                                  >
                                    {t('theme_detail.position_label')}
                                  </Text>
                                  <Text strong style={{ fontFamily: token.fontFamilyCode, fontSize: 11.5, color: stageColor }}>
                                    {Math.round(positionPct)}%
                                  </Text>
                                </Flex>
                                <div
                                  style={{
                                    width: '100%',
                                    height: 6,
                                    background: token.colorFillTertiary,
                                    borderRadius: 3,
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.max(positionPct, 1.5)}%`,
                                      height: '100%',
                                      background: stageColor,
                                      transition: 'width 0.3s',
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </Card>
                        )
                      })()}
                    </div>

                    {(highConfDiffs.length > 0 || validSims.length > 0) && (
                      <div style={{ marginTop: 28 }}>
                        <div style={sublabelStyle}>{t('theme_detail.layer3_title')}</div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: 12,
                            alignItems: 'stretch',
                          }}
                        >
                          {validSims.length > 0 && (
                            <Card
                              size="small"
                              styles={{ body: { padding: '14px 16px 14px 18px', height: '100%' } }}
                              style={{
                                height: '100%',
                                borderColor: token.colorBorderSecondary,
                                background: token.colorBgContainer,
                                borderLeft: `3px solid ${token.colorSuccess}`,
                              }}
                            >
                              <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                                <span style={{ color: token.colorSuccess, fontSize: 13, lineHeight: 1 }}>✓</span>
                                <Text
                                  strong
                                  style={{
                                    fontSize: 12,
                                    color: token.colorSuccess,
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  {t('theme_detail.similarities_column_title')}
                                </Text>
                              </Flex>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {validSims.map((s, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 8,
                                      fontSize: 12,
                                      color: token.colorTextSecondary,
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    <span style={{ color: token.colorSuccess, flexShrink: 0, lineHeight: 1.5 }}>·</span>
                                    <span>{s.description}</span>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          )}

                          {highConfDiffs.length > 0 && (
                            <Card
                              size="small"
                              styles={{ body: { padding: '14px 16px 14px 18px', height: '100%' } }}
                              style={{
                                height: '100%',
                                borderColor: token.colorBorderSecondary,
                                background: token.colorBgContainer,
                                borderLeft: `3px solid ${token.colorWarning}`,
                              }}
                            >
                              <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                                <span style={{ color: token.colorWarning, fontSize: 13, lineHeight: 1 }}>⚠</span>
                                <Text
                                  strong
                                  style={{
                                    fontSize: 12,
                                    color: token.colorWarning,
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  {t('theme_detail.differences_column_title')}
                                </Text>
                              </Flex>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {highConfDiffs.map((d, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 8,
                                      fontSize: 12,
                                      color: token.colorTextSecondary,
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    <span style={{ color: token.colorWarning, flexShrink: 0, lineHeight: 1.5 }}>·</span>
                                    <span>
                                      <span style={{ fontWeight: 500, color: token.colorText }}>
                                        {dimGroup(d.dimension)}:
                                      </span>{' '}
                                      {d.description}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          )}
                        </div>

                        <Text
                          style={{
                            display: 'block',
                            marginTop: 12,
                            fontSize: 12,
                            color: token.colorTextSecondary,
                            lineHeight: 1.5,
                          }}
                        >
                          <span style={{ color: token.colorTextTertiary, fontWeight: 500 }}>
                            {t('theme_detail.conclusion_label')}:
                          </span>{' '}
                          {highConfDiffs.length >= 2
                            ? t('theme_detail.conclusion_diverged')
                            : t('theme_detail.conclusion_aligned')}
                        </Text>
                      </div>
                    )}
                    </>
                    )}

                  </div>
                )
              })()}

              {/* Exit Signals · Section 06 */}
              {(theme.archetype_playbook?.exit_signals?.length ?? 0) > 0 && (() => {
                const pb = (locale === 'zh' && theme.archetype_playbook_zh?.exit_signals?.length
                  ? theme.archetype_playbook_zh
                  : theme.archetype_playbook) as NonNullable<typeof theme.archetype_playbook>
                const signals = pb.exit_signals ?? []
                return (
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.exit_signals_title')}
                      subtitle={t('sections.exit_signals_subtitle')}
                      meta={t('common.ai_disclaimer_short')}
                    />
                    <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
                      <div style={{ display: 'grid', rowGap: 2 }}>
                        {signals.map((s, i) => {
                          const trig = theme.exit_signal_triggers?.find((x) => x.signal_index === i) ?? null
                          const isTriggered = trig?.trigger_status === 'triggered'
                          const isMonitoring = trig?.trigger_status === 'not_triggered'
                          const marker = isTriggered ? '✓' : isMonitoring ? '⚠' : '·'
                          const markerColor = isTriggered
                            ? token.colorError
                            : isMonitoring
                            ? token.colorWarning
                            : token.colorTextQuaternary
                          const labelKey = isTriggered
                            ? 'theme_detail.exit_signal_status_triggered'
                            : isMonitoring
                            ? 'theme_detail.exit_signal_status_monitoring'
                            : 'theme_detail.exit_signal_status_manual'
                          const triggeredAt = trig?.triggered_at
                            ? new Date(trig.triggered_at).toISOString().slice(0, 10)
                            : null
                          const ev = trig?.triggered_evidence ?? null
                          const signalText = typeof s === 'string' ? s : (s as { signal?: string; description?: string }).signal ?? JSON.stringify(s)
                          const signalDesc = typeof s === 'string' ? null : (s as { signal?: string; description?: string }).description ?? null
                          let evidenceLine: string | null = null
                          if (isTriggered && trig?.trigger_rule_type === 'stale') {
                            evidenceLine = t('theme_detail.exit_signal_evidence_stale')
                          } else if (isTriggered && trig?.trigger_rule_type === 'event_count' && typeof ev?.contradicts_count === 'number') {
                            evidenceLine = t('theme_detail.exit_signal_evidence_contradicts', { count: String(ev.contradicts_count) })
                          }
                          return (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                fontSize: 12.5,
                                color: token.colorTextSecondary,
                                padding: '7px 0',
                                borderBottom: i === signals.length - 1 ? 'none' : `1px solid ${token.colorSplit}`,
                              }}
                            >
                              <span style={{ color: markerColor, lineHeight: 1.5, flexShrink: 0, fontWeight: isTriggered ? 600 : 400 }}>{marker}</span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 10.5, color: markerColor, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                    {t(labelKey)}{triggeredAt ? ` · ${triggeredAt}` : ''}
                                  </span>
                                </div>
                                <span style={{ lineHeight: 1.5 }}>{signalText}</span>
                                {signalDesc && (
                                  <span style={{ lineHeight: 1.45, fontSize: 11.5, color: token.colorTextTertiary }}>{signalDesc}</span>
                                )}
                                {evidenceLine && (
                                  <span style={{ lineHeight: 1.45, fontSize: 11.5, color: token.colorTextTertiary }}>
                                    {evidenceLine}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
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
  isCooling: boolean
  daysHot: number
  daysSinceLastEvent: number
}) {
  const { t, locale } = useI18n()
  const { token } = useToken()

  const visibleEvents = showAllEvents ? filteredEvents : filteredEvents.slice(0, 8)

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

      <SectionHeader
        index={sectionIndex}
        title={t('sections.theme_events_title')}
        subtitle={t('sections.theme_events_subtitle')}
      />
      <Card size="small" styles={{ body: { padding: 0 } }}>
        {catalysts.length === 0 ? (
          <Text style={{ display: 'block', padding: '16px 14px', fontSize: 12, color: token.colorTextTertiary }}>
            {t('theme_detail.no_catalysts')}
          </Text>
        ) : (
          <>
            <div style={{ padding: '12px 14px 14px', borderBottom: `1px solid ${token.colorSplit}` }}>
              <Flex gap={8} wrap>
                {(['all', 'supports', 'contradicts', 'neutral'] as EventTab[]).map((k) => (
                  <FilterPill
                    key={k}
                    label={t(k === 'all' ? 'theme_detail.tab_all' : `theme_detail.${k}`)}
                    count={eventCounts[k]}
                    active={eventTab === k}
                    onClick={() => setEventTab(k)}
                  />
                ))}
              </Flex>
            </div>

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
                    {(() => {
                      const headline = pickField(locale, c.short_headline ?? c.headline, c.short_headline_zh)
                      return c.source_url ? (
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
                          {headline}
                        </a>
                      ) : (
                        <Text style={{ color: token.colorText, fontSize: 12.5, lineHeight: 1.4 }}>
                          {headline}
                        </Text>
                      )
                    })()}
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
          marginTop: 10,
          letterSpacing: '0.06em',
        }}
      >
        ℹ {t('theme_detail.ai_source_hint')}
      </Text>
    </>
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
  const { token } = useToken()
  const { t } = useI18n()
  const [imgError, setImgError] = useState(false)

  const confNum = typeof item.confidence === 'number' ? Math.round(item.confidence) : null
  const confColor =
    confNum === null ? token.colorTextQuaternary
    : confNum >= 80 ? '#5C4A1E'
    : confNum >= 65 ? '#8B5A00'
    : confNum >= 50 ? token.colorTextTertiary
    : token.colorTextQuaternary

  const initials = item.ticker_symbol.slice(0, 1)
  const isMixed = item.exposure_type === 'mixed'
  const contextLabel = item.context_label?.trim() || null
  const mixedTooltip = contextLabel ?? t('theme_detail.mixed_tooltip')

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
            <Flex align="center" gap={6} style={{ minWidth: 0 }}>
              <Text
                strong
                style={{
                  fontFamily: token.fontFamilyCode,
                  fontSize: 13,
                  color: token.colorText,
                  lineHeight: 1.2,
                }}
              >
                {item.ticker_symbol}
              </Text>
              {isMixed && (
                <Tooltip title={mixedTooltip}>
                  <Tag
                    color="warning"
                    style={{
                      margin: 0,
                      fontSize: 9.5,
                      lineHeight: 1.3,
                      padding: '0 5px',
                      borderRadius: 3,
                    }}
                  >
                    {t('theme_detail.mixed_badge')}
                  </Tag>
                </Tooltip>
              )}
            </Flex>
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
            {contextLabel && !isMixed && (
              <Tooltip title={contextLabel}>
                <Text
                  ellipsis
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: token.colorTextTertiary,
                    lineHeight: 1.3,
                    marginTop: 2,
                  }}
                >
                  · {contextLabel}
                </Text>
              </Tooltip>
            )}
          </div>
        </Flex>

        {confNum !== null && (
          <Flex align="center" justify="flex-end" style={{ marginTop: 'auto' }}>
            <Text
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: 14,
                fontWeight: 600,
                color: confColor,
                letterSpacing: '-0.01em',
              }}
            >
              {confNum}
            </Text>
          </Flex>
        )}
      </div>
    </Link>
  )
}
