'use client'

import Link from 'next/link'
import { Card, Col, Flex, Row, Tag, Typography, theme } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { DirectionTag } from './DirectionTag'
import { FocusLevelBadge } from '@/components/shared/FocusLevelBadge'

const { Text, Paragraph, Title } = Typography
const { useToken } = theme

export interface ThemeCardItem {
  themeId: string
  label: string
  exposurePct: number | null
  tier: number
  exposureDirection: 'benefits' | 'headwind' | 'mixed' | 'uncertain' | string | null
  roleReasoning: string | null
  fullThemeId?: string | null
  themeStrength?: number | null
  category?: string | null
  horizonLabel?: string | null
  eventCount?: number | null
  updatedAgo?: string | null
  daysActive?: number | null
  expectedDuration?: string | null
}

interface Labels {
  viewFullTheme: string
  exposure: string
  events: string
  expected: string
  tier1: string
  tier2: string
  tier3: string
  directionBenefits: string
  directionHeadwind: string
  directionMixed: string
  directionUncertain: string
}

interface Props {
  items: ThemeCardItem[]
  labels: Labels
}

function tierLabel(tier: number, labels: Labels): string {
  if (tier === 1) return labels.tier1
  if (tier === 2) return labels.tier2
  return labels.tier3
}

function directionLabel(d: ThemeCardItem['exposureDirection'], labels: Labels): string {
  if (d === 'benefits') return labels.directionBenefits
  if (d === 'headwind') return labels.directionHeadwind
  if (d === 'mixed') return labels.directionMixed
  return labels.directionUncertain
}

function PillTag({ children }: { children: React.ReactNode }) {
  const { token } = useToken()
  return (
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
      {children}
    </Tag>
  )
}

function StatDot() {
  const { token } = useToken()
  return (
    <Text style={{ fontSize: 12, color: token.colorTextQuaternary }}>·</Text>
  )
}

function ThemeDetailCard({ item, labels }: { item: ThemeCardItem; labels: Labels }) {
  const { token } = useToken()

  const statTier = tierLabel(item.tier, labels)
  const statExposure =
    item.exposurePct != null
      ? labels.exposure.replace('{pct}', String(Math.round(item.exposurePct)))
      : null
  const statDays = item.daysActive != null ? `${item.daysActive}d` : null
  const statExpected = item.expectedDuration
    ? labels.expected.replace('{label}', item.expectedDuration)
    : null

  const cardInner = (
    <Card
      hoverable={!!item.fullThemeId}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
          height: '100%',
        },
      }}
      style={{
        background: token.colorBgContainer,
        borderColor: token.colorBorderSecondary,
        height: '100%',
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
              letterSpacing: '-0.01em',
            }}
          >
            {item.label}
          </Title>
          {item.themeStrength != null && (
            <span style={{ flexShrink: 0 }}>
              <FocusLevelBadge strength={item.themeStrength} />
            </span>
          )}
        </Flex>

        {item.roleReasoning && (
          <Paragraph
            style={{
              margin: '8px 0 0',
              fontSize: 13,
              lineHeight: 1.6,
              color: token.colorTextSecondary,
            }}
          >
            {item.roleReasoning}
          </Paragraph>
        )}

        <Flex align="center" gap={10} wrap style={{ marginTop: 12 }}>
          {item.category && <PillTag>{item.category}</PillTag>}
          {item.horizonLabel && <PillTag>{item.horizonLabel}</PillTag>}
          {item.eventCount != null && (
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
              {labels.events.replace('{n}', String(item.eventCount))}
            </Text>
          )}
          {item.eventCount != null && item.updatedAgo && <StatDot />}
          {item.updatedAgo && (
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
              {item.updatedAgo}
            </Text>
          )}
        </Flex>
      </div>

      <Flex
        align="center"
        wrap
        gap={6}
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: `1px solid ${token.colorSplit}`,
          fontSize: 12,
          color: token.colorTextSecondary,
          rowGap: 6,
        }}
      >
        <Text style={{ fontSize: 12, color: token.colorText, fontWeight: 500 }}>
          {statTier}
        </Text>
        {statExposure && (
          <>
            <StatDot />
            <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
              {statExposure}
            </Text>
          </>
        )}
        {statDays && (
          <>
            <StatDot />
            <Text
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: 12,
                color: token.colorTextSecondary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {statDays}
            </Text>
          </>
        )}
        {statExpected && (
          <>
            <StatDot />
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
              {statExpected}
            </Text>
          </>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ flexShrink: 0 }}>
          <DirectionTag
            direction={item.exposureDirection}
            label={directionLabel(item.exposureDirection, labels)}
            fontSize={12}
          />
        </span>
        {item.fullThemeId && (
          <Text
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: token.colorPrimary,
              marginLeft: 8,
              flexShrink: 0,
            }}
          >
            {labels.viewFullTheme}
            <ArrowRightOutlined style={{ fontSize: 10 }} />
          </Text>
        )}
      </Flex>
    </Card>
  )

  if (!item.fullThemeId) return cardInner

  return (
    <Link
      href={`/themes/${item.fullThemeId}`}
      style={{
        display: 'block',
        height: '100%',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      {cardInner}
    </Link>
  )
}

export function ThemeCards({ items, labels }: Props) {
  return (
    <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
      {items.map((it) => (
        <Col key={it.themeId} xs={24} md={12}>
          <ThemeDetailCard item={it} labels={labels} />
        </Col>
      ))}
    </Row>
  )
}
