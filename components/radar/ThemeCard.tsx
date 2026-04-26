'use client'

import Link from 'next/link'
import { Card, Flex, Progress, Tag, Typography, theme } from 'antd'
import type { ThemeRadarItem, ExposureDirection, ArchetypePlaybook } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { useField, useJsonField } from '@/lib/useField'
import { stageColor } from '@/lib/design-tokens'
import { arrowColor } from '@/lib/category-colors'
import { formatRelativeTime } from '@/lib/utils'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'
import { HorizonBadge } from '@/components/shared/HorizonBadge'

const { Title, Text, Paragraph } = Typography
const { useToken } = theme

interface ThemeCardProps {
  theme: ThemeRadarItem
  variant: 'core' | 'secondary'
}

function directionArrow(dir: ExposureDirection): { glyph: string; color: string } | null {
  if (dir === 'benefits') return { glyph: '▲', color: arrowColor.benefits }
  if (dir === 'headwind') return { glyph: '▼', color: arrowColor.headwind }
  return null
}

const STAGE_LABEL_KEY: Record<string, string> = {
  early: 'theme_card.stage_early',
  mid: 'theme_card.stage_mid',
  late: 'theme_card.stage_late',
  beyond: 'theme_card.stage_beyond',
  beyond_typical: 'theme_card.stage_beyond',
}

export function ThemeCard({ theme: th }: ThemeCardProps) {
  const { t, locale } = useI18n()
  const { token } = useToken()
  const themeName = useField(th, 'name')
  const summary = useField(th, 'summary')
  const pb = useJsonField<ThemeRadarItem, ArchetypePlaybook>(th, 'archetype_playbook')

  const [minDays, maxDays] = pb?.typical_duration_days_approx ?? [0, 0]
  const expectedDays = maxDays > 0 ? maxDays : Math.round((minDays + maxDays) / 2)
  const progressPct = expectedDays > 0
    ? Math.min(100, Math.max(2, (th.days_hot / expectedDays) * 100))
    : 10

  const tier1 = th.recommendations.filter((r) => r.tier === 1)
  const tier2 = th.recommendations.filter((r) => r.tier === 2)
  const tickerLimit = 5
  const visibleTickers = [...tier1, ...tier2].slice(0, tickerLimit)
  const overflow = th.recommendations.length - visibleTickers.length

  const stageLabelKey = STAGE_LABEL_KEY[th.playbook_stage]
  const stageText = stageLabelKey ? t(stageLabelKey) : ''
  const stageDotColor = stageColor(th.playbook_stage)
  const statusText = t(`theme_card.status_${th.status}`) || th.status

  const timeAgo = th.latest_event_date ? formatRelativeTime(th.latest_event_date, t, locale) : ''
  const categoryLabel = th.category ? t(`categories.${th.category}`) : null
  const durationLabel = pb?.typical_duration_label ?? ''
  const sinceDate = pb?.real_world_timeline?.approximate_start ?? ''
  const sinceDateDetail =
    (pb?.real_world_timeline as { approximate_start_detail?: string } | null | undefined)
      ?.approximate_start_detail ?? ''

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
          height: 320,
          background: token.colorBgContainer,
          borderColor: token.colorBorderSecondary,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Flex justify="space-between" align="flex-start" gap={12}>
            <Title
              level={5}
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: token.colorText,
                lineHeight: 1.5,
              }}
              ellipsis={{ rows: 2 }}
            >
              {themeName}
            </Title>
            <span style={{ flexShrink: 0 }}>
              <FocusLevelBadge strength={th.theme_strength_score} />
            </span>
          </Flex>

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
                  fontWeight: 500,
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
          <Flex
            gap={6}
            align="center"
            style={{
              marginBottom: 10,
              height: 24,
              overflow: 'hidden',
              flexWrap: 'nowrap',
            }}
          >
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
                    flexShrink: 0,
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
              <Text style={{ fontSize: 11, color: token.colorTextTertiary, flexShrink: 0 }}>
                +{overflow}
              </Text>
            )}
          </Flex>
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
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: stageDotColor,
                  display: 'inline-block',
                }}
              />
              <Text style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 500, textTransform: 'lowercase' }}>
                {stageText || t('theme_card.stage_mid')}
              </Text>
              {statusText && (
                <>
                  <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>·</Text>
                  <Text style={{ fontSize: 11, color: token.colorTextTertiary, textTransform: 'lowercase' }}>{statusText}</Text>
                </>
              )}
            </Flex>
            <span style={{ lineHeight: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 500, color: token.colorText }}>
                {th.days_hot}d
              </Text>
              {expectedDays > 0 && (
                <Text style={{ fontSize: 10, color: token.colorTextQuaternary, marginLeft: 4 }}>
                  / ~{expectedDays}d {t('theme_card.expected')}
                </Text>
              )}
            </span>
          </Flex>
          <Flex justify="space-between" align="center" gap={8} style={{ marginTop: 6, minHeight: 14 }}>
            <Text
              title={sinceDateDetail || sinceDate || undefined}
              style={{
                fontSize: 10,
                color: token.colorTextTertiary,
                letterSpacing: '0.02em',
                minWidth: 0,
                maxWidth: '60%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {sinceDate ? t('theme_card.since_short', { date: sinceDate }) : ''}
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: token.colorTextTertiary,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {durationLabel ? `${t('theme_card.expected_duration')} ${durationLabel}` : ''}
            </Text>
          </Flex>
        </div>
      </Card>
    </Link>
  )
}
