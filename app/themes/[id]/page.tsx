'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Breadcrumb,
  Button,
  Card,
  Flex,
  Input,
  Layout,
  Progress,
  Space,
  Tag,
  Typography,
  theme as antdTheme,
} from 'antd'
import { MoonOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { pickField } from '@/lib/useField'
import { formatRelativeTime } from '@/lib/utils'
import { formatCategoryLabel } from '@/lib/theme-formatter'
import { getDisplayPublisher } from '@/lib/source-display'
import type {
  CatalystEvent,
  EventDirection,
  ThemeRadarItem,
  ThemeRecommendation,
} from '@/types/recommendations'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'
import { SectionHeader } from '@/components/shared/SectionHeader'
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
  const directRecs = recs.filter((r) => r.exposure_type === 'direct')
  const observationalRecs = recs.filter((r) => r.exposure_type === 'observational')
  const pressureRecs = recs.filter((r) => r.exposure_type === 'pressure')
  const unclassified = recs.filter((r) => !r.exposure_type && r.exposure_direction !== 'headwind')
  const headwinds = recs.filter((r) => !r.exposure_type && r.exposure_direction === 'headwind')

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
                      {locale === 'en' && theme.name_zh && (
                        <Text style={{ display: 'block', marginTop: 8, fontSize: 14, color: token.colorTextTertiary }}>
                          {theme.name_zh}
                        </Text>
                      )}
                      {locale === 'zh' && theme.name_zh && (
                        <Text style={{ display: 'block', marginTop: 8, fontSize: 14, color: token.colorTextTertiary, fontStyle: 'italic' }}>
                          {theme.name}
                        </Text>
                      )}
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

              {/* Summary */}
              {(() => {
                const summary = pickField(locale, theme.summary, theme.summary_zh)
                return summary ? (
                  <div className="td-sec">
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.theme_thesis_title')}
                      subtitle={t('sections.theme_thesis_subtitle')}
                    />
                    <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 }}>{summary}</p>
                  </div>
                ) : null
              })()}

              {/* Lifespan / Timeline */}
              {(() => {
                const pb = theme.archetype_playbook
                const daysMax = pb?.typical_duration_days_approx?.[1] || 90
                const expectedDays = daysMax > 0 ? daysMax : 0
                const progressPercent = expectedDays > 0
                  ? Math.min(100, Math.round((theme.days_hot / expectedDays) * 100))
                  : 20
                const stageText = t(`theme_card.stage_${theme.playbook_stage === 'beyond' ? 'beyond' : theme.playbook_stage}`)
                const dtype = pb?.duration_type ?? 'bounded'
                const modeNote =
                  dtype === 'extended' ? t('timeline.extended_note')
                  : dtype === 'dependent' ? t('timeline.dependent_note')
                  : t(`theme_detail.stage_desc_${theme.playbook_stage}`)
                const isCooling = theme.status === 'cooling'
                const coolPct = Math.min(100, Math.max(0, Math.round(((theme.days_since_last_event - 30) / 30) * 100)))
                const stageColor = getStageColor(theme.playbook_stage)

                return (
                  <div style={{ marginTop: 32 }}>
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.theme_lifespan_title')}
                      subtitle={t('sections.theme_lifespan_subtitle')}
                    />
                    <Card size="small" styles={{ body: { padding: '18px 20px' } }}>
                      <Flex
                        justify="space-between"
                        style={{
                          fontFamily: token.fontFamilyCode,
                          fontSize: 10,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: token.colorTextQuaternary,
                          marginBottom: 10,
                        }}
                      >
                        <span>{theme.first_seen_at.slice(0, 10)}</span>
                        <span>Day {theme.days_hot} / ~{expectedDays || '?'}</span>
                        <span>{t('theme_detail.expected_end')}</span>
                      </Flex>
                      <Progress
                        percent={progressPercent}
                        strokeColor={stageColor}
                        trailColor={token.colorFillSecondary}
                        showInfo={false}
                        size={['100%', 4]}
                        strokeLinecap="square"
                      />
                      <Flex
                        justify="space-between"
                        align="center"
                        wrap
                        gap={8}
                        style={{ marginTop: 12 }}
                      >
                        <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
                          {t('theme_card.stage_prefix')}: <Text strong style={{ color: token.colorText, fontSize: 12 }}>{stageText}</Text>
                        </Text>
                        <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                          {theme.days_active} {t('theme_detail.days')} · updated {formatRelativeTime(theme.last_active_at, t, locale)}
                        </Text>
                      </Flex>
                      {modeNote && (
                        <Text
                          style={{
                            display: 'block',
                            marginTop: 8,
                            fontSize: 12,
                            color: token.colorTextTertiary,
                            fontStyle: 'italic',
                          }}
                        >
                          {modeNote}
                        </Text>
                      )}
                      {isCooling && (
                        <div
                          style={{
                            marginTop: 16,
                            padding: '12px 14px',
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
                              marginBottom: 3,
                            }}
                          >
                            {t('theme_detail.cooling_banner_title', { n: theme.days_hot })}
                          </Text>
                          <Text
                            style={{
                              display: 'block',
                              fontSize: 11,
                              color: token.colorWarningText,
                              opacity: 0.85,
                              marginBottom: 8,
                            }}
                          >
                            {t('theme_detail.cooling_archive_hint', {
                              n: theme.days_since_last_event,
                              m: Math.max(0, 60 - theme.days_since_last_event),
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
                          <Flex
                            justify="space-between"
                            style={{
                              fontFamily: token.fontFamilyCode,
                              fontSize: 10,
                              letterSpacing: '0.08em',
                              color: token.colorWarningText,
                              opacity: 0.8,
                              marginTop: 6,
                            }}
                          >
                            <span>{t('theme_detail.cooling_label')}</span>
                            <span>{theme.days_since_last_event}d / 60d</span>
                          </Flex>
                        </div>
                      )}
                    </Card>
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

              {/* Bull vs Bear */}
              {theme.counter_evidence_summary && (() => {
                const s = theme.counter_evidence_summary
                const total = s.supports_count + s.contradicts_count + s.neutral_count
                if (total === 0) return null
                const maxCount = Math.max(s.supports_count, s.contradicts_count, s.neutral_count, 1)
                const ratio = s.contradicts_count === 0
                  ? s.supports_count > 0 ? `${s.supports_count}:0` : '—'
                  : (s.supports_count / s.contradicts_count).toFixed(2) + ':1'
                const bearWarn = s.contradicts_count > s.supports_count
                const strongBull = s.supports_count >= s.contradicts_count * 3 && s.supports_count > 0
                const label = bearWarn ? null : strongBull ? t('theme_detail.strong_bull') : t('theme_detail.balanced')
                return (
                  <div className="td-sec">
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.theme_evidence_title')}
                      subtitle={t('sections.theme_evidence_subtitle')}
                    />
                    <div className="td-card">
                      {bearWarn && <div className="td-bb-warn">⚠ {t('theme_detail.bear_warning')}</div>}
                      <div className="td-bb">
                        <div className="td-bb-row">
                          <span className="lbl"><span className="dot" style={{ background: '#7A8C5C' }} />{t('theme_detail.supports')}</span>
                          <div className="track"><div className="f sup" style={{ width: `${(s.supports_count / maxCount) * 100}%` }} /></div>
                          <span className="v">{s.supports_count}</span>
                        </div>
                        <div className="td-bb-row">
                          <span className="lbl"><span className="dot" style={{ background: '#B8453A' }} />{t('theme_detail.contradicts')}</span>
                          <div className="track"><div className="f con" style={{ width: `${(s.contradicts_count / maxCount) * 100}%` }} /></div>
                          <span className="v">{s.contradicts_count}</span>
                        </div>
                        <div className="td-bb-row">
                          <span className="lbl"><span className="dot" style={{ background: 'var(--ink-4)' }} />{t('theme_detail.neutral')}</span>
                          <div className="track"><div className="f neu" style={{ width: `${(s.neutral_count / maxCount) * 100}%` }} /></div>
                          <span className="v">{s.neutral_count}</span>
                        </div>
                      </div>
                      <div className="td-bb-foot">
                        <span>{t('theme_detail.bull_bear_ratio')}: <span style={{ fontFamily: 'inherit', color: 'var(--ink)' }}>{ratio}</span></span>
                        {label && <span>{label}</span>}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Trigger Events */}
              <div className="td-sec">
                <SectionHeader
                  index={nextIdx()}
                  title={t('sections.theme_events_title')}
                  subtitle={t('sections.theme_events_subtitle')}
                  meta={`${catalysts.length}`}
                />
                {catalysts.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>{t('theme_detail.no_catalysts')}</p>
                ) : (
                  <>
                    {hasDirection && (
                      <div className="td-evts-tabs">
                        {(['all', 'supports', 'contradicts', 'neutral'] as EventTab[]).map((k) => {
                          const labelKey = k === 'all' ? 'theme_detail.tab_all' : `theme_detail.${k}`
                          const count = eventCounts[k]
                          return (
                            <button key={k} onClick={() => setEventTab(k)} className={eventTab === k ? 'on' : ''}>
                              {t(labelKey)} {count}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {GROUP_ORDER.map((key) => {
                      const items = groupedEvents.get(key)
                      if (!items || items.length === 0) return null
                      return (
                        <div key={key} className="td-evt-grp">
                          <div className="td-evt-grp-head">
                            <span>{t(GROUP_LABEL[key])}</span>
                            <span>{items.length}</span>
                          </div>
                          {items.map((c) => {
                            const publisher = getDisplayPublisher(c.source_name, c.source_url)
                            const reasoning = pickField(
                              locale,
                              c.counter_evidence_reasoning,
                              c.counter_evidence_reasoning_zh,
                            )
                            const isExp = expanded.has(c.id)
                            return (
                              <div key={c.id} className="td-evt">
                                <div className={`dot ${dirDot(c.supports_or_contradicts)}`} />
                                <div>
                                  {c.source_url ? (
                                    <a href={c.source_url} target="_blank" rel="noopener noreferrer">{c.headline}</a>
                                  ) : (
                                    <span style={{ color: 'var(--ink)' }}>{c.headline}</span>
                                  )}
                                  <div className="sub">
                                    <span>{publisher}</span>
                                    <span>·</span>
                                    <span>{c.days_ago === 0 ? t('theme_detail.today') : t('relative_time.days_ago', { n: c.days_ago })}</span>
                                    {reasoning && (
                                      <>
                                        <span>·</span>
                                        <button onClick={() => toggleExpand(c.id)}>
                                          {isExp ? t('theme_detail.collapse') : t('theme_detail.counter_reasoning')}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  {isExp && reasoning && <div className="rsn">{reasoning}</div>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}

                    {filteredEvents.length > 8 && (
                      <button
                        onClick={() => setShowAllEvents((v) => !v)}
                        style={{ marginTop: 8, fontSize: 12, color: 'var(--link)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {showAllEvents ? t('theme_detail.collapse_events') : t('theme_detail.view_all_events', { n: filteredEvents.length })}
                      </button>
                    )}
                  </>
                )}
                <p style={{ fontFamily: 'inherit', fontSize: 10, color: 'var(--ink-4)', fontStyle: 'italic', marginTop: 12, letterSpacing: '0.04em' }}>
                  ℹ {t('theme_detail.ai_source_hint')}
                </p>
              </div>

              {/* Exposure Mapping */}
              <div className="td-sec">
                <SectionHeader
                  index={nextIdx()}
                  title={t('sections.theme_exposure_title')}
                  subtitle={t('sections.theme_exposure_subtitle')}
                />
                {recs.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>{t('theme_detail.no_exposure')}</p>
                )}

                <ExposureGroup title={t('theme_detail.direct_exposure')} items={directRecs} />
                <ExposureGroup title={t('theme_detail.observational_mapping')} items={observationalRecs} />
                <ExposureGroup title={t('theme_detail.pressure_assets')} items={pressureRecs} variant="pressure" />
                <ExposureGroup title={t('theme_detail.diversified_beneficiaries')} items={unclassified} />
                <ExposureGroup title={t('theme_detail.headwinds')} items={headwinds} variant="headwind" />
              </div>

              {/* Subthemes */}
              {theme.child_themes.length > 0 && (
                <div className="td-sec">
                  <SectionHeader
                    index={nextIdx()}
                    title={t('sections.theme_subthemes_title')}
                    subtitle={t('sections.theme_subthemes_subtitle')}
                    meta={`${theme.child_themes.length}`}
                  />
                  <div className="td-subs">
                    {theme.child_themes.map((c) => (
                      <Link key={c.id} href={`/themes/${c.id}`} className="td-sub">
                        <div className="nm">{pickField(locale, c.name, c.name_zh)}</div>
                        <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FocusLevelBadge strength={c.theme_strength_score} />
                          <span>· {t('themes_list.events', { n: c.event_count })}</span>
                        </div>
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

                return (
                  <div className="td-sec">
                    <SectionHeader
                      index={nextIdx()}
                      title={t('sections.theme_playbook_title')}
                      subtitle={t('sections.theme_playbook_subtitle')}
                    />

                    <p style={{ fontFamily: 'inherit', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.04em', marginBottom: 10, fontStyle: 'italic' }}>
                      ℹ {t('theme_detail.disclaimer_playbook')}
                    </p>

                    <div className="td-sublabel">{t('theme_detail.historical_cases')}</div>
                    <div className="td-cases">
                      {pb.historical_cases.map((c, i) => (
                        <div key={i} className="td-case">
                          <div className="nm">{c.name}</div>
                          <div className="row">{c.approximate_duration}</div>
                          <div className="row pm">Peak {c.peak_move}</div>
                        </div>
                      ))}
                    </div>

                    {(visibleDiffs.length > 0 || validSims.length > 0 || ttd?.observation) && (
                      <>
                        <div style={{ marginTop: 18 }} className="td-ttd-panel">
                          <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 4 }}>
                            {t('theme_detail.this_time_different')}
                          </div>

                          {visibleDiffs.length > 0 && (
                            <>
                              <div className="td-sublabel">{t('theme_detail.structural_differences')}</div>
                              <div className="td-diffs">
                                {visibleDiffs.map((d, i) => {
                                  const arrow = d.direction === 'may_extend' ? '↑' : d.direction === 'may_shorten' ? '↓' : '⇅'
                                  const arrowCls = d.direction === 'may_extend' ? 'up' : d.direction === 'may_shorten' ? 'down' : 'unc'
                                  return (
                                    <div key={i} className="td-diff">
                                      <div className="td-diff-head">
                                        <span className={`arr ${arrowCls}`}>{arrow}</span>
                                        <span className="dim">{dimGroup(d.dimension)}</span>
                                        <span className={`conf ${d.confidence === 'high' ? 'high' : 'med'}`}>{d.confidence}</span>
                                      </div>
                                      <div className="desc">{d.description}</div>
                                    </div>
                                  )
                                })}
                              </div>
                              {!showAllDiffs && hiddenCount > 0 && (
                                <button
                                  onClick={() => setShowAllDiffs(true)}
                                  style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                                >
                                  {t('theme_detail.show_all_diffs')} ({hiddenCount} {t('theme_detail.more_medium_conf')})
                                </button>
                              )}
                            </>
                          )}

                          {validSims.length > 0 && (
                            <>
                              <div className="td-sublabel">{t('theme_detail.similarities')}</div>
                              <ul style={{ fontSize: 12.5, color: 'var(--ink-2)', listStyle: 'none', padding: 0, margin: 0 }}>
                                {validSims.map((s, i) => (
                                  <li key={i} style={{ padding: '3px 0' }}>
                                    <span style={{ color: 'var(--ink-4)', marginRight: 6 }}>=</span>
                                    <span style={{ color: 'var(--ink-3)' }}>{s.dimension}:</span> {s.description}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}

                          {ttd?.observation && (
                            <div style={{ marginTop: 12, fontSize: 12.5, fontStyle: 'italic', color: 'var(--ink-2)', lineHeight: 1.6 }}>
                              {t('theme_detail.observation')}: {ttd.observation}
                            </div>
                          )}

                          <div style={{ marginTop: 10, fontFamily: 'inherit', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.04em', fontStyle: 'italic' }}>
                            ⚠ {t('theme_detail.disclaimer_observation')}
                          </div>
                        </div>
                      </>
                    )}

                    {(pb.exit_signals?.length ?? 0) > 0 && (
                      <>
                        <div className="td-sublabel" style={{ marginTop: 22 }}>{t('theme_detail.exit_signals')}</div>
                        <div className="td-exits">
                          {pb.exit_signals.map((s, i) => (
                            <div key={i} className="td-exit">
                              <span className="bl">{String(i + 1).padStart(2, '0')}</span>
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}

                <div style={{ marginTop: 40, padding: '16px 0', fontSize: 11, color: token.colorTextQuaternary, textAlign: 'center', letterSpacing: '0.02em' }}>
                  {t('common.disclaimer_footer')}
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
  if (items.length === 0) return null
  return (
    <div className={`td-expos-group ${variant}`}>
      <div className="td-expos-group-title">
        <span>{title}</span>
        <span className="n">· {items.length}</span>
      </div>
      {items.map((r) => {
        const reasoning = pickField(locale, r.role_reasoning, r.role_reasoning_zh)
        const exposure = pickField(locale, r.business_exposure, r.business_exposure_zh)
        const catalyst = pickField(locale, r.catalyst, r.catalyst_zh)
        const risk = pickField(locale, r.risk, r.risk_zh)
        const capLabel = r.market_cap_band === 'small' ? t('theme_detail.cap_small')
          : r.market_cap_band === 'mid' ? t('theme_detail.cap_mid')
          : r.market_cap_band === 'large' ? t('theme_detail.cap_large')
          : null
        const confColor =
          r.confidence_band === 'high' ? { color: '#3F5A28', background: '#DDE6D4' }
          : r.confidence_band === 'medium' ? { color: '#6E5A27', background: '#EEE6D2' }
          : { color: 'var(--ink-3)', background: 'var(--bg-sunk)' }
        return (
          <div key={r.ticker_symbol} className="td-rec">
            <div className="td-rec-head">
              <Link href={`/tickers/${r.ticker_symbol}`} className="td-rec-sym">${r.ticker_symbol}</Link>
              {r.company_name && r.company_name !== r.ticker_symbol && (
                <span className="td-rec-name">{r.company_name}</span>
              )}
              <div className="td-rec-badges">
                {r.is_thematic_tool && (
                  <span title={t('theme_detail.thematic_tool_tooltip')} className="tag" style={{ background: '#EEE0F0', color: '#7B4D8C', borderColor: '#E1CDE4' }}>💎</span>
                )}
                {r.confidence_band && (
                  <span className="mark" style={{ ...confColor, borderColor: 'transparent' }}>{r.confidence_band}</span>
                )}
                {capLabel && <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{capLabel}</span>}
              </div>
            </div>
            {reasoning.trim().length > 0 && <div className="td-rec-body">{reasoning}</div>}
            <div className="td-rec-meta">
              {exposure.trim().length > 0 && (
                <div><span className="k">{t('theme_detail.exposure_label')}</span>{exposure}</div>
              )}
              {catalyst.trim().length > 0 && (
                <div><span className="k" style={{ color: '#506238' }}>{t('theme_detail.catalyst')}</span>{catalyst}</div>
              )}
              {risk.trim().length > 0 && (
                <div><span className="k" style={{ color: '#8A3A32' }}>{t('theme_detail.risk')}</span>{risk}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
