'use client'

import Link from 'next/link'
import {
  Card,
  Col,
  ConfigProvider,
  Flex,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd'
import { EyeFilled } from '@ant-design/icons'
import type { ThemeRadarItem, ExposureDirection, ArchetypePlaybook } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { useField, useJsonField } from '@/lib/useField'
import { arrowColor } from '@/lib/category-colors'
import { formatRelativeTime } from '@/lib/utils'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'
import { HorizonBadge } from '@/components/shared/HorizonBadge'
import {
  generateWhyNow,
  getExpectedDuration,
  calcProgress,
  getStageAlertHeadline,
  getStageReadout,
  getUrgencyScore,
} from '@/lib/theme-helpers'
import { getEvents48h } from '@/lib/theme-priority'

const { Title, Text, Paragraph } = Typography
const { useToken } = theme

interface TopNarrativeCardProps {
  theme: ThemeRadarItem
  rank: number
  variant: 'hero' | 'compact'
}

function directionArrow(dir: ExposureDirection): { glyph: string; color: string } | null {
  if (dir === 'benefits') return { glyph: '▲', color: arrowColor.benefits }
  if (dir === 'headwind') return { glyph: '▼', color: arrowColor.headwind }
  return null
}

const RANK_GLYPH = ['①', '②', '③']

interface RankTone {
  accent: string
  accentBg: string
  accentBorder: string
}

function rankTone(rank: number, isDark: boolean): RankTone {
  if (isDark) {
    if (rank === 0) {
      return { accent: '#D49285', accentBg: 'rgba(200, 122, 107, 0.14)', accentBorder: 'rgba(200, 122, 107, 0.32)' }
    }
    if (rank === 1) {
      return { accent: '#D4A862', accentBg: 'rgba(200, 154, 82, 0.14)', accentBorder: 'rgba(200, 154, 82, 0.32)' }
    }
    return { accent: '#B5C272', accentBg: 'rgba(143, 160, 88, 0.14)', accentBorder: 'rgba(143, 160, 88, 0.32)' }
  }
  if (rank === 0) {
    return { accent: '#0F6F66', accentBg: '#DBEDEB', accentBorder: '#C2DDD9' }
  }
  if (rank === 1) {
    return { accent: '#2A4488', accentBg: '#DCE4F2', accentBorder: '#C5D0E5' }
  }
  return { accent: '#7A5C12', accentBg: '#F0E8D2', accentBorder: '#DDD3B5' }
}

export function TopNarrativeCard({ theme: th, rank, variant }: TopNarrativeCardProps) {
  const { t, locale } = useI18n()
  const { token } = useToken()
  const { mode } = useThemeMode()
  const isDark = mode === 'dark'
  const themeName = useField(th, 'name')
  const altName = locale === 'zh' ? th.name : th.name_zh
  const summary = useField(th, 'summary')
  const pb = useJsonField<ThemeRadarItem, ArchetypePlaybook>(th, 'archetype_playbook')

  const expectedDays = getExpectedDuration(th)
  const progressPct = calcProgress(th)

  const tier1 = th.recommendations.filter((r) => r.tier === 1)
  const tier2 = th.recommendations.filter((r) => r.tier === 2)

  const timeAgo = th.latest_event_date ? formatRelativeTime(th.latest_event_date, t, locale) : ''
  const categoryLabel = th.category ? t(`categories.${th.category}`) : null

  const whyNowReasons = generateWhyNow(th)
  const rankGlyph = RANK_GLYPH[rank] ?? `#${rank + 1}`
  const tone = rankTone(rank, isDark)
  const stage = getStageReadout(th.playbook_stage)

  if (variant === 'hero') {
    const events48h = getEvents48h(th)
    const urgency = getUrgencyScore(th)
    const tickerCount = th.recommendations.length
    const heroTickers = [...tier1, ...tier2].slice(0, 6)
    const heroOverflow = tickerCount - heroTickers.length
    const exitSignalRaw = pb?.exit_signals?.[0] as unknown
    const exitSignal: string =
      typeof exitSignalRaw === 'string'
        ? exitSignalRaw
        : exitSignalRaw && typeof exitSignalRaw === 'object'
        ? (locale === 'zh'
            ? ((exitSignalRaw as { signal_zh?: string; signal?: string }).signal_zh ??
              (exitSignalRaw as { signal?: string }).signal ??
              '')
            : ((exitSignalRaw as { signal?: string }).signal ?? '')) || ''
        : ''
    const alertHeadline = getStageAlertHeadline(th, locale, t)
    const primaryWhyNow = whyNowReasons[0]

    return (
      <Link
        href={`/themes/${th.id}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <Card
          hoverable
          styles={{ body: { padding: 20 } }}
          style={{
            background: token.colorBgContainer,
            borderColor: token.colorBorder,
          }}
        >
          {/* 1 · Top badges row */}
          <Flex justify="space-between" align="center" wrap gap={12}>
            <Space size={8} wrap>
              <Text
                style={{
                  background: 'transparent',
                  color: token.colorText,
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  letterSpacing: '0.08em',
                }}
              >
                {rankGlyph} {t('narratives.narrative_prefix')} #{rank + 1}
              </Text>
              <Tag
                style={{
                  background: tone.accentBg,
                  color: tone.accent,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.5,
                  padding: '3px 10px',
                  margin: 0,
                  borderRadius: 4,
                }}
              >
                {t('narratives.top_priority')}
              </Tag>
            </Space>
            <FocusLevelBadge strength={th.theme_strength_score} stage={th.playbook_stage} typicalDurationDaysUpper={pb?.typical_duration_days_approx?.[1]} />
          </Flex>

          {/* 2 · Title */}
          <Title
            level={2}
            style={{
              margin: '16px 0 2px',
              fontSize: 28,
              fontWeight: 600,
              color: token.colorText,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
            }}
          >
            {themeName}
          </Title>
          {altName && (
            <Text style={{ fontSize: 14, color: token.colorTextTertiary, display: 'block' }}>{altName}</Text>
          )}

          {/* Category + meta */}
          <Space size={12} wrap style={{ marginTop: 10, marginBottom: 14 }}>
            {categoryLabel && (
              <Tag
                style={{
                  margin: 0,
                  background: token.colorFillAlter,
                  color: token.colorTextSecondary,
                  border: `1px solid ${token.colorBorder}`,
                  fontSize: 12,
                  padding: '2px 10px',
                  borderRadius: 4,
                  lineHeight: 1.5,
                }}
              >
                {categoryLabel}
              </Tag>
            )}
            <HorizonBadge typicalDurationDaysUpper={pb?.typical_duration_days_approx?.[1]} />
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
              {t('theme_card.events', { n: th.event_count })}
            </Text>
            {timeAgo && (
              <>
                <Text style={{ fontSize: 12, color: token.colorTextQuaternary }}>·</Text>
                <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>{timeAgo}</Text>
              </>
            )}
          </Space>

          {/* Description */}
          {summary && (
            <Paragraph
              style={{
                fontSize: 13,
                color: token.colorTextSecondary,
                lineHeight: 1.6,
                marginTop: 0,
                marginBottom: 14,
              }}
              ellipsis={{ rows: 2 }}
            >
              {summary}
            </Paragraph>
          )}

          {/* 3 · Attention callout (neutral, no warning color) */}
          <div
            style={{
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderLeft: `3px solid ${token.colorText}`,
              borderRadius: 4,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <Flex gap={10} align="flex-start">
              <EyeFilled
                style={{ color: token.colorTextSecondary, fontSize: 13, marginTop: 4, flexShrink: 0 }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: token.colorText,
                    display: 'block',
                    lineHeight: 1.5,
                  }}
                >
                  {alertHeadline}
                </Text>
                {exitSignal && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: token.colorTextTertiary,
                      lineHeight: 1.55,
                      display: 'block',
                      marginTop: 6,
                    }}
                  >
                    {exitSignal}
                  </Text>
                )}
              </div>
            </Flex>
          </div>

          {/* 4 · Stage + Progress (2-col neutral panel) */}
          <Card
            size="small"
            style={{
              background: token.colorFillAlter,
              border: 'none',
              marginBottom: 14,
            }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Row gutter={20} align="middle">
              <Col xs={24} sm={8}>
                <Text style={{ fontSize: 10, color: token.colorTextTertiary, letterSpacing: '0.05em', textTransform: 'none', display: 'block' }}>
                  {t('narratives.lifecycle_stage')}
                </Text>
                <Title
                  level={3}
                  style={{
                    margin: '4px 0 2px',
                    fontSize: 22,
                    fontWeight: 600,
                    color: tone.accent,
                    lineHeight: 1,
                  }}
                >
                  {t(stage.bigKey)}
                </Title>
                <Text style={{ fontSize: 10, color: token.colorTextTertiary, fontWeight: 600, letterSpacing: '0.1em' }}>
                  {t(stage.transitionKey)}
                </Text>
              </Col>
              <Col xs={24} sm={16}>
                <Flex justify="space-between" align="baseline">
                  <Text style={{ fontSize: 10, color: token.colorTextTertiary, letterSpacing: '0.05em', textTransform: 'none' }}>
                    {t('narratives.current_progress')}
                  </Text>
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                    {t('narratives.day_of_expected', { days: th.days_hot, total: expectedDays })}
                  </Text>
                </Flex>
                <Flex align="baseline" gap={6} style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 22, fontWeight: 600, color: token.colorText, lineHeight: 1 }}>
                    {t('narratives.day_short', { days: th.days_hot })}
                  </Text>
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                    / ~{expectedDays} {t('narratives.days_suffix_short')}
                  </Text>
                </Flex>
                <Progress
                  percent={progressPct}
                  showInfo={false}
                  size="small"
                  strokeLinecap="square"
                  strokeColor={token.colorText}
                  trailColor={token.colorBorder}
                  style={{ marginTop: 8, marginBottom: 0 }}
                />
              </Col>
            </Row>
          </Card>

          {/* 5 · 4 inline metrics */}
          <Row
            gutter={16}
            style={{
              paddingBottom: 12,
              borderBottom: `1px solid ${token.colorBorder}`,
              marginBottom: 14,
              marginLeft: 0,
              marginRight: 0,
            }}
          >
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: token.colorTextTertiary, letterSpacing: '0.05em', textTransform: 'none', display: 'block' }}>
                {t('narratives.strength_label')}
              </Text>
              <Flex align="baseline" gap={3} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: tone.accent, lineHeight: 1 }}>
                  {Math.round(th.theme_strength_score)}
                </Text>
                <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>/100</Text>
              </Flex>
            </Col>
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: token.colorTextTertiary, letterSpacing: '0.05em', textTransform: 'none', display: 'block' }}>
                {t('narratives.events_48h')}
              </Text>
              <Flex align="baseline" gap={3} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: token.colorText, lineHeight: 1 }}>
                  {events48h}
                </Text>
                <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                  {events48h === 1 ? t('narratives.event_unit') : t('narratives.events_unit')}
                </Text>
              </Flex>
            </Col>
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: token.colorTextTertiary, letterSpacing: '0.05em', textTransform: 'none', display: 'block' }}>
                {t('narratives.urgency_label')}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: 600, color: token.colorText, display: 'block', marginTop: 6 }}>
                {t(urgency.labelKey)}
              </Text>
            </Col>
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: token.colorTextTertiary, letterSpacing: '0.05em', textTransform: 'none', display: 'block' }}>
                {t('narratives.tickers_label')}
              </Text>
              <Flex align="baseline" gap={4} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: token.colorText, lineHeight: 1 }}>
                  {tickerCount}
                </Text>
                <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                  {t('narratives.tickers_unit')}
                </Text>
              </Flex>
            </Col>
          </Row>

          {/* 6 · Related tickers */}
          <div style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 10, color: token.colorTextTertiary, letterSpacing: '0.05em', textTransform: 'none', display: 'block', marginBottom: 6 }}>
              {t('narratives.related_tickers')}
            </Text>
            <ConfigProvider
              theme={{
                components: {
                  Tag: {
                    defaultBg: token.colorFillAlter,
                    defaultColor: token.colorText,
                  },
                },
              }}
            >
              <Space wrap size={[6, 6]}>
                {heroTickers.map((r) => {
                  const arrow = directionArrow(r.exposure_direction)
                  return (
                    <Tag
                      key={r.ticker_symbol}
                      style={{
                        borderColor: token.colorBorder,
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '3px 10px',
                        margin: 0,
                        borderRadius: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      ${r.ticker_symbol}
                      {arrow && <span style={{ color: arrow.color, fontSize: 10 }}>{arrow.glyph}</span>}
                    </Tag>
                  )
                })}
                {heroOverflow > 0 && (
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>+{heroOverflow} {t('narratives.more_suffix')}</Text>
                )}
              </Space>
            </ConfigProvider>
          </div>

          {/* 7 · Why Now (single line, neutral bg + amber border) */}
          {primaryWhyNow && (
            <div
              style={{
                background: token.colorFillAlter,
                borderLeft: `3px solid ${token.colorBorder}`,
                padding: '8px 12px',
                marginBottom: 14,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 10, color: token.colorTextTertiary, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'none', display: 'block' }}>
                {t('narratives.why_now')}
              </Text>
              <Text style={{ fontSize: 13, color: token.colorText, display: 'block', marginTop: 2, lineHeight: 1.5 }}>
                · {t(primaryWhyNow.key, primaryWhyNow.params)}
              </Text>
            </div>
          )}

        </Card>
      </Link>
    )
  }

  // ========== COMPACT variant (#2 #3) ==========
  const tickerLimit = 5
  const visibleTickers = [...tier1, ...tier2].slice(0, tickerLimit)
  const overflow = th.recommendations.length - visibleTickers.length

  return (
    <Link
      href={`/themes/${th.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}
    >
      <Card
        hoverable
        styles={{
          body: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: 20,
          },
        }}
        style={{
          height: '100%',
          background: token.colorBgContainer,
          borderColor: token.colorBorderSecondary,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: 8 }}>
            <Text
              style={{
                background: 'transparent',
                color: token.colorText,
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1.5,
                letterSpacing: '0.08em',
              }}
            >
              {rankGlyph} {t('narratives.narrative_prefix')} #{rank + 1}
            </Text>
            <span style={{ flexShrink: 0 }}>
              <FocusLevelBadge strength={th.theme_strength_score} stage={th.playbook_stage} typicalDurationDaysUpper={pb?.typical_duration_days_approx?.[1]} />
            </span>
          </Flex>

          <Title
            level={5}
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: token.colorText,
              lineHeight: 1.35,
            }}
            ellipsis={{ rows: 2 }}
          >
            {themeName}
          </Title>

          {summary && (
            <Paragraph
              style={{
                margin: '8px 0 0',
                fontSize: 13,
                lineHeight: 1.6,
                color: token.colorTextSecondary,
              }}
              ellipsis={{ rows: 2 }}
            >
              {summary}
            </Paragraph>
          )}

          <Flex align="center" gap={10} wrap style={{ marginTop: 12 }}>
            {categoryLabel && (
              <Tag
                style={{
                  margin: 0,
                  background: token.colorFillAlter,
                  color: token.colorTextSecondary,
                  border: `1px solid ${token.colorBorder}`,
                  fontSize: 12,
                  padding: '2px 10px',
                  borderRadius: 4,
                  lineHeight: 1.5,
                }}
              >
                {categoryLabel}
              </Tag>
            )}
            <HorizonBadge typicalDurationDaysUpper={pb?.typical_duration_days_approx?.[1]} />
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
              {t('theme_card.events', { n: th.event_count })}
            </Text>
            {timeAgo && (
              <>
                <Text style={{ fontSize: 12, color: token.colorTextQuaternary }}>·</Text>
                <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>{timeAgo}</Text>
              </>
            )}
          </Flex>
        </div>

        <div style={{ marginTop: 16 }}>
          {visibleTickers.length > 0 && (
            <Flex wrap gap={6} align="center" style={{ marginBottom: 10 }}>
              {visibleTickers.map((r) => {
                const arrow = directionArrow(r.exposure_direction)
                return (
                  <span
                    key={r.ticker_symbol}
                    style={{
                      backgroundColor: token.colorFillAlter,
                      color: token.colorText,
                      border: `1px solid ${token.colorBorder}`,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: 4,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    ${r.ticker_symbol}
                    {arrow && (
                      <span style={{ color: arrow.color, fontSize: 9 }}>{arrow.glyph}</span>
                    )}
                  </span>
                )
              })}
              {overflow > 0 && (
                <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>+{overflow} {t('narratives.more_suffix')}</Text>
              )}
            </Flex>
          )}

          {whyNowReasons.length > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 10px',
                background: token.colorFillAlter,
                borderRadius: 4,
                borderLeft: `2px solid ${token.colorBorder}`,
              }}
            >
              <Text
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: token.colorTextTertiary,
                  letterSpacing: '0.08em',
                  textTransform: 'none',
                  marginBottom: 4,
                }}
              >
                {t('narratives.why_now')}
              </Text>
              {whyNowReasons.map((reason, i) => (
                <Text
                  key={i}
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: token.colorText,
                    lineHeight: 1.5,
                  }}
                >
                  · {t(reason.key, reason.params)}
                </Text>
              ))}
            </div>
          )}

          <Progress
            percent={progressPct}
            showInfo={false}
            size="small"
            strokeLinecap="square"
            strokeColor={token.colorText}
            trailColor={token.colorBorder}
            style={{ marginBottom: 6 }}
          />
          <Flex justify="space-between" align="center">
            <Flex align="center" gap={6}>
              <Text style={{ fontSize: 11, color: token.colorText, fontWeight: 600 }}>
                {t(stage.bigKey)}
              </Text>
              <Text style={{ fontSize: 10, color: token.colorTextTertiary, fontWeight: 600, letterSpacing: '0.08em' }}>
                / {t(stage.transitionKey)}
              </Text>
            </Flex>
            <span style={{ lineHeight: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 500, color: token.colorText }}>
                {th.days_hot}d
              </Text>
              {expectedDays > 0 && (
                <Text style={{ fontSize: 10, color: token.colorTextQuaternary, marginLeft: 4 }}>
                  / ~{expectedDays}d
                </Text>
              )}
            </span>
          </Flex>
        </div>
      </Card>
    </Link>
  )
}
