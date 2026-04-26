'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import { Button, Flex, Tag, Typography, theme } from 'antd'
import { LinkOutlined } from '@ant-design/icons'

const { Text } = Typography
const { useToken } = theme

export interface EventItem {
  id: string
  date: string
  headline: string
  sourceName: string | null
  sourceUrl: string | null
  impact: 'high' | 'medium' | 'low' | string | null
  themeId: string | null
  themeName: string | null
}

interface Props {
  items: EventItem[]
  labels: {
    showAll: string
    collapse: string
    today: string
    hoursAgo: string
    daysAgo: string
    weeksAgo: string
    impactHigh: string
    impactMedium: string
    impactLow: string
    linkedTheme: string
  }
  isDark: boolean
  initialDisplay?: number
}

// Warm / neutral importance palette · disjoint from Direction (green/red)
const IMPORTANCE_PALETTE_LIGHT = {
  high: { color: '#8B5A00', background: '#FFF1D6' },
  medium: { color: '#7B6A4E', background: '#F2EAD8' },
  low: { color: '#8F8A7E', background: '#F2EEE5' },
} as const

const IMPORTANCE_PALETTE_DARK = {
  high: { color: '#D4A862', background: 'rgba(200, 154, 82, 0.16)' },
  medium: { color: '#B5A98A', background: 'rgba(160, 145, 110, 0.16)' },
  low: { color: '#7A7468', background: 'rgba(120, 115, 105, 0.16)' },
} as const

function ImportanceTag({
  impact,
  isDark,
  label,
}: {
  impact: 'high' | 'medium' | 'low' | string | null
  isDark: boolean
  label: string
}) {
  if (!impact) return null
  const palette = isDark ? IMPORTANCE_PALETTE_DARK : IMPORTANCE_PALETTE_LIGHT
  const tier =
    impact === 'high' ? palette.high
    : impact === 'medium' ? palette.medium
    : palette.low
  return (
    <Tag
      style={{
        background: tier.background,
        color: tier.color,
        border: 'none',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 500,
        margin: 0,
        lineHeight: 1.4,
      }}
    >
      {label}
    </Tag>
  )
}

function impactLabel(impact: string | null, labels: Props['labels']): string {
  switch (impact) {
    case 'high': return labels.impactHigh
    case 'medium': return labels.impactMedium
    case 'low': return labels.impactLow
    default: return ''
  }
}

function relativeTime(iso: string, labels: Props['labels']): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3600000)
  if (hours < 1) return labels.today
  if (hours < 24) return labels.hoursAgo.replace('{n}', String(hours))
  const days = Math.floor(hours / 24)
  if (days < 14) return labels.daysAgo.replace('{n}', String(days))
  const weeks = Math.floor(days / 7)
  return labels.weeksAgo.replace('{n}', String(weeks))
}

const EventCard = memo(function EventCard({
  ev,
  labels,
  isDark,
}: {
  ev: EventItem
  labels: Props['labels']
  isDark: boolean
}) {
  const { token } = useToken()
  const time = relativeTime(ev.date, labels)

  return (
    <a
      href={ev.sourceUrl ?? '#'}
      target={ev.sourceUrl ? '_blank' : undefined}
      rel={ev.sourceUrl ? 'noopener noreferrer' : undefined}
      className="ticker-event-card hover-card"
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
          marginBottom: 6,
          fontFeatureSettings: '"tnum"',
        }}
      >
        <span style={{ fontFamily: token.fontFamilyCode }}>{time}</span>
        {ev.sourceName && (
          <>
            <span style={{ color: token.colorTextQuaternary }}>·</span>
            <span style={{ fontWeight: 500, color: token.colorTextSecondary }}>
              {ev.sourceName}
            </span>
          </>
        )}
        {ev.impact && (
          <>
            <span style={{ color: token.colorTextQuaternary }}>·</span>
            <ImportanceTag impact={ev.impact} isDark={isDark} label={impactLabel(ev.impact, labels)} />
          </>
        )}
        <span style={{ flex: 1 }} />
        {ev.sourceUrl && (
          <LinkOutlined style={{ fontSize: 12, color: token.colorTextQuaternary }} />
        )}
      </Flex>

      <Text
        style={{
          display: 'block',
          fontSize: 15,
          fontWeight: 500,
          color: token.colorText,
          lineHeight: 1.45,
          marginBottom: ev.themeName ? 10 : 0,
        }}
      >
        {ev.headline}
      </Text>

      {ev.themeName && ev.themeId && (
        <Flex align="center" gap={6} style={{ fontSize: 12, color: token.colorTextTertiary }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: token.colorTextQuaternary,
            }}
          >
            {labels.linkedTheme}
          </span>
          <Link
            href={`/themes/${ev.themeId}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              color: token.colorTextSecondary,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            {ev.themeName}
          </Link>
        </Flex>
      )}
    </a>
  )
})

export function EventsList({ items, labels, isDark, initialDisplay = 5 }: Props) {
  const { token } = useToken()
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, initialDisplay)

  return (
    <div style={{ marginTop: 12 }}>
      <Flex vertical gap={10}>
        {visible.map((ev) => (
          <EventCard key={ev.id} ev={ev} labels={labels} isDark={isDark} />
        ))}
      </Flex>
      {items.length > initialDisplay && (
        <Button
          type="link"
          size="small"
          onClick={() => setShowAll((v) => !v)}
          style={{ paddingInline: 0, marginTop: 10 }}
        >
          {showAll ? labels.collapse : labels.showAll.replace('{n}', String(items.length))}
        </Button>
      )}

    </div>
  )
}
