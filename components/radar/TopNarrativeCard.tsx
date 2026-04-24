'use client'

import Link from 'next/link'
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowRightOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  WarningFilled,
} from '@ant-design/icons'
import type { ThemeRadarItem, ExposureDirection, ArchetypePlaybook } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { useField, useJsonField } from '@/lib/useField'
import { arrowColor } from '@/lib/category-colors'
import { formatRelativeTime } from '@/lib/utils'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'
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

function rankTone(rank: number): RankTone {
  if (rank === 0) {
    return { accent: '#8B3A2E', accentBg: '#FAF1ED', accentBorder: '#E8D5CC' }
  }
  if (rank === 1) {
    return { accent: '#8B5A00', accentBg: '#FFF5E0', accentBorder: '#F0E4C8' }
  }
  return { accent: '#5C6A1E', accentBg: '#F0F2D8', accentBorder: '#DDE0C0' }
}

export function TopNarrativeCard({ theme: th, rank, variant }: TopNarrativeCardProps) {
  const { t, locale } = useI18n()
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
  const tone = rankTone(rank)
  const stage = getStageReadout(th.playbook_stage)

  if (variant === 'hero') {
    const events48h = getEvents48h(th)
    const urgency = getUrgencyScore(th)
    const tickerCount = th.recommendations.length
    const heroTickers = [...tier1, ...tier2].slice(0, 6)
    const heroOverflow = tickerCount - heroTickers.length
    const exitSignal = pb?.exit_signals?.[0]
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
            background: '#FFFFFF',
            borderColor: '#E8E2D5',
            boxShadow: '0 1px 3px rgba(31, 28, 25, 0.04)',
          }}
        >
          {/* 1 · Top badges row */}
          <Flex justify="space-between" align="center" wrap gap={12}>
            <Space size={8} wrap>
              <Tag
                style={{
                  background: tone.accent,
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 12px',
                  margin: 0,
                  letterSpacing: '0.08em',
                }}
              >
                {rankGlyph} {t('narratives.narrative_prefix')} #{rank + 1}
              </Tag>
              <Tag
                style={{
                  background: tone.accentBg,
                  color: tone.accent,
                  border: 'none',
                  fontSize: 12,
                  padding: '3px 10px',
                  margin: 0,
                }}
              >
                {t('narratives.top_priority')}
              </Tag>
            </Space>
            <FocusLevelBadge strength={th.theme_strength_score} />
          </Flex>

          {/* 2 · Title */}
          <Title
            level={2}
            style={{
              margin: '16px 0 2px',
              fontSize: 28,
              fontWeight: 600,
              color: '#1F1C19',
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
            }}
          >
            {themeName}
          </Title>
          {altName && (
            <Text style={{ fontSize: 14, color: '#8C8A85', display: 'block' }}>{altName}</Text>
          )}

          {/* Category + meta */}
          <Space size={12} wrap style={{ marginTop: 10, marginBottom: 14 }}>
            {categoryLabel && (
              <Tag
                style={{
                  margin: 0,
                  background: '#FAFAFA',
                  color: '#595959',
                  border: '1px solid #E8E2D5',
                  fontSize: 12,
                  padding: '2px 10px',
                  borderRadius: 4,
                  lineHeight: 1.5,
                }}
              >
                {categoryLabel}
              </Tag>
            )}
            <Text style={{ fontSize: 12, color: '#8C8A85' }}>
              {t('theme_card.events', { n: th.event_count })}
            </Text>
            {timeAgo && (
              <>
                <Text style={{ fontSize: 12, color: '#A8A196' }}>·</Text>
                <Text style={{ fontSize: 12, color: '#8C8A85' }}>{timeAgo}</Text>
              </>
            )}
          </Space>

          {/* Description */}
          {summary && (
            <Paragraph
              style={{
                fontSize: 13,
                color: '#5C4A1E',
                lineHeight: 1.6,
                marginTop: 0,
                marginBottom: 14,
              }}
              ellipsis={{ rows: 2 }}
            >
              {summary}
            </Paragraph>
          )}

          {/* 3 · Stage Alert (dark-rust left border) */}
          <Alert
            showIcon
            icon={<WarningFilled style={{ color: tone.accent }} />}
            message={
              <Text style={{ fontSize: 14, fontWeight: 500, color: tone.accent }}>
                {alertHeadline}
              </Text>
            }
            description={
              exitSignal ? (
                <Text style={{ fontSize: 12, color: '#8C8A85', lineHeight: 1.5 }}>{exitSignal}</Text>
              ) : undefined
            }
            style={{
              background: tone.accentBg,
              border: `1px solid ${tone.accentBorder}`,
              borderLeft: `4px solid ${tone.accent}`,
              borderRadius: 4,
              padding: '8px 12px',
              marginBottom: 14,
            }}
          />

          {/* 4 · Stage + Progress (2-col neutral panel) */}
          <Card
            size="small"
            style={{
              background: '#FAFAFA',
              border: 'none',
              marginBottom: 14,
            }}
            styles={{ body: { padding: '14px 16px' } }}
          >
            <Row gutter={20} align="middle">
              <Col xs={24} sm={8}>
                <Text style={{ fontSize: 10, color: '#8C8A85', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block' }}>
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
                <Text style={{ fontSize: 10, color: '#8C8A85', fontWeight: 600, letterSpacing: '0.1em' }}>
                  {t(stage.transitionKey)}
                </Text>
              </Col>
              <Col xs={24} sm={16}>
                <Flex justify="space-between" align="baseline">
                  <Text style={{ fontSize: 10, color: '#8C8A85', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {t('narratives.current_progress')}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#8C8A85' }}>
                    {t('narratives.day_of_expected', { days: th.days_hot, total: expectedDays })}
                  </Text>
                </Flex>
                <Flex align="baseline" gap={6} style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 22, fontWeight: 600, color: '#1F1C19', lineHeight: 1 }}>
                    {t('narratives.day_short', { days: th.days_hot })}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#8C8A85' }}>
                    / ~{expectedDays} {t('narratives.days_suffix_short')}
                  </Text>
                </Flex>
                <Progress
                  percent={progressPct}
                  showInfo={false}
                  size="small"
                  strokeLinecap="square"
                  strokeColor="#1F1C19"
                  trailColor="#E8E2D5"
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
              borderBottom: '1px solid #E8E2D5',
              marginBottom: 14,
              marginLeft: 0,
              marginRight: 0,
            }}
          >
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: '#8C8A85', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block' }}>
                {t('narratives.strength_label')}
              </Text>
              <Flex align="baseline" gap={3} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: tone.accent, lineHeight: 1 }}>
                  {Math.round(th.theme_strength_score)}
                </Text>
                <Text style={{ fontSize: 11, color: '#8C8A85' }}>/100</Text>
              </Flex>
            </Col>
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: '#8C8A85', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block' }}>
                {t('narratives.events_48h')}
              </Text>
              <Flex align="baseline" gap={3} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: '#1F1C19', lineHeight: 1 }}>
                  {events48h}
                </Text>
                <Text style={{ fontSize: 11, color: '#8C8A85' }}>
                  {events48h === 1 ? t('narratives.event_unit') : t('narratives.events_unit')}
                </Text>
              </Flex>
            </Col>
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: '#8C8A85', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block' }}>
                {t('narratives.urgency_label')}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: 600, color: '#1F1C19', display: 'block', marginTop: 6 }}>
                {t(urgency.labelKey)}
              </Text>
            </Col>
            <Col xs={12} md={6}>
              <Text style={{ fontSize: 10, color: '#8C8A85', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block' }}>
                {t('narratives.tickers_label')}
              </Text>
              <Flex align="baseline" gap={4} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: '#1F1C19', lineHeight: 1 }}>
                  {tickerCount}
                </Text>
                <Text style={{ fontSize: 11, color: '#8C8A85' }}>
                  {t('narratives.tickers_unit')}
                </Text>
              </Flex>
            </Col>
          </Row>

          {/* 6 · Tickers + graph CTA */}
          <Row gutter={12} align="middle" style={{ marginBottom: 14 }}>
            <Col flex="1" style={{ minWidth: 0 }}>
              <Text style={{ fontSize: 10, color: '#8C8A85', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                {t('narratives.related_tickers')}
              </Text>
              <Space wrap size={[6, 6]}>
                {heroTickers.map((r) => {
                  const arrow = directionArrow(r.exposure_direction)
                  return (
                    <Tag
                      key={r.ticker_symbol}
                      style={{
                        background: '#FAFAFA',
                        color: '#1F1C19',
                        border: '1px solid #E8E2D5',
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
                  <Text style={{ fontSize: 12, color: '#8C8A85' }}>+{heroOverflow} {t('narratives.more_suffix')}</Text>
                )}
              </Space>
            </Col>
            <Col flex="none">
              <Button
                icon={<NodeIndexOutlined />}
                size="middle"
                style={{
                  border: '1px solid #E8E2D5',
                  background: '#FFFFFF',
                  color: '#1F1C19',
                  fontSize: 12,
                  fontWeight: 500,
                  height: 34,
                }}
              >
                {t('narratives.view_full_map')}
              </Button>
            </Col>
          </Row>

          {/* 7 · Why Now (single line, neutral bg + amber border) */}
          {primaryWhyNow && (
            <div
              style={{
                background: '#FAFAFA',
                borderLeft: '3px solid #8B5A00',
                padding: '8px 12px',
                marginBottom: 14,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 10, color: '#8B5A00', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block' }}>
                {t('narratives.why_now')}
              </Text>
              <Text style={{ fontSize: 13, color: '#1F1C19', display: 'block', marginTop: 2, lineHeight: 1.5 }}>
                · {t(primaryWhyNow.key, primaryWhyNow.params)}
              </Text>
            </div>
          )}

          {/* 8 · CTA */}
          <Button
            type="primary"
            icon={<FileTextOutlined />}
            block
            size="middle"
            style={{
              background: '#1F1C19',
              borderColor: '#1F1C19',
              height: 42,
              fontSize: 13,
              fontWeight: 500,
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{t('narratives.view_full_analysis')}</span>
            <ArrowRightOutlined style={{ fontSize: 12 }} />
          </Button>
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
          background: '#FFFFFF',
          borderColor: '#F0F0F0',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: tone.accent,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {rankGlyph} {t('narratives.narrative_prefix')} #{rank + 1}
            </Text>
            <span style={{ flexShrink: 0 }}>
              <FocusLevelBadge strength={th.theme_strength_score} size="small" />
            </span>
          </Flex>

          <Title
            level={5}
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: '#1F1C19',
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
                color: '#5C4A1E',
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
                  background: '#FAFAFA',
                  color: '#595959',
                  border: '1px solid #E8E2D5',
                  fontSize: 12,
                  padding: '2px 10px',
                  borderRadius: 4,
                  lineHeight: 1.5,
                }}
              >
                {categoryLabel}
              </Tag>
            )}
            <Text style={{ fontSize: 12, color: '#8C8A85' }}>
              {t('theme_card.events', { n: th.event_count })}
            </Text>
            {timeAgo && (
              <>
                <Text style={{ fontSize: 12, color: '#A8A196' }}>·</Text>
                <Text style={{ fontSize: 12, color: '#8C8A85' }}>{timeAgo}</Text>
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
                      backgroundColor: '#FAFAFA',
                      color: '#1F1C19',
                      border: '1px solid #E8E2D5',
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
                <Text style={{ fontSize: 11, color: '#8C8A85' }}>+{overflow} {t('narratives.more_suffix')}</Text>
              )}
            </Flex>
          )}

          {whyNowReasons.length > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 10px',
                background: '#FAFAFA',
                borderRadius: 4,
                borderLeft: '2px solid #8B5A00',
              }}
            >
              <Text
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#8B5A00',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
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
                    color: '#1F1C19',
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
            strokeColor="#1F1C19"
            trailColor="#E8E2D5"
            style={{ marginBottom: 6 }}
          />
          <Flex justify="space-between" align="center">
            <Flex align="center" gap={6}>
              <Text style={{ fontSize: 11, color: '#1F1C19', fontWeight: 600 }}>
                {t(stage.bigKey)}
              </Text>
              <Text style={{ fontSize: 10, color: '#8C8A85', fontWeight: 600, letterSpacing: '0.08em' }}>
                / {t(stage.transitionKey)}
              </Text>
            </Flex>
            <span style={{ lineHeight: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 500, color: '#1F1C19' }}>
                {th.days_hot}d
              </Text>
              {expectedDays > 0 && (
                <Text style={{ fontSize: 10, color: '#A8A196', marginLeft: 4 }}>
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
