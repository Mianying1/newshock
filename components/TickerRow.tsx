'use client'
import { type ReactNode } from 'react'
import Link from 'next/link'
import { Tag, Typography, theme } from 'antd'
import { RightOutlined } from '@ant-design/icons'

const { Text } = Typography
const { useToken } = theme

export interface TickerRowBadge {
  label: ReactNode
  title?: string
}

export function NewspaperIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </svg>
  )
}

export function BotIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  )
}

interface Props {
  href: string
  rank?: number
  symbol: string
  rightText?: string
  rightSmall?: string
  rightTooltip?: string
  sentiment?: 'bullish' | 'mixed' | 'bearish' | 'neutral' | null
  inlineBadges?: TickerRowBadge[]
  rightBadge?: TickerRowBadge | null
  compact?: boolean
}

function SentimentDot({ sentiment }: { sentiment: Props['sentiment'] }) {
  const { token } = useToken()
  if (!sentiment) return null
  const color =
    sentiment === 'bullish'
      ? token.colorSuccess
      : sentiment === 'bearish'
        ? token.colorError
        : sentiment === 'mixed'
          ? token.colorTextQuaternary
          : null
  if (!color) {
    return (
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          border: `1px solid ${token.colorTextQuaternary}`,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

export default function TickerRow({
  href,
  rank,
  symbol,
  rightText,
  rightSmall,
  rightTooltip,
  sentiment,
  inlineBadges,
  rightBadge,
  compact = false,
}: Props) {
  const { token } = useToken()

  return (
    <Link href={href} className="ticker-row">
      {rank !== undefined && (
        <Text
          style={{
            flexShrink: 0,
            width: 20,
            textAlign: 'right',
            fontFamily: token.fontFamilyCode,
            fontSize: token.fontSizeSM,
            color: token.colorTextTertiary,
          }}
        >
          {rank}
        </Text>
      )}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}
      >
        <Text
          style={{
            fontFamily: token.fontFamilyCode,
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: token.colorText,
            fontSize: compact ? token.fontSize : token.fontSizeLG,
          }}
        >
          {symbol}
        </Text>
        <SentimentDot sentiment={sentiment} />
        {inlineBadges?.map((b, i) => (
          <Text
            key={i}
            type="secondary"
            title={b.title}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: token.fontSizeSM,
              whiteSpace: 'nowrap',
            }}
          >
            {b.label}
          </Text>
        ))}
      </span>
      <span style={{ flex: 1 }} />
      {rightBadge && (
        <Tag
          title={rightBadge.title}
          style={{
            margin: 0,
            fontSize: token.fontSizeSM,
            flexShrink: 0,
          }}
        >
          {rightBadge.label}
        </Tag>
      )}
      {rightText && (
        <span
          title={rightTooltip}
          style={{
            fontFamily: token.fontFamilyCode,
            fontSize: token.fontSize,
            fontWeight: 500,
            color: token.colorText,
            textAlign: 'right',
            flexShrink: 0,
            minWidth: 42,
            cursor: rightTooltip ? 'help' : undefined,
          }}
        >
          {rightText}
          {rightSmall && (
            <Text
              type="secondary"
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: token.fontSizeSM,
                marginLeft: 2,
                fontWeight: 400,
              }}
            >
              {rightSmall}
            </Text>
          )}
        </span>
      )}
      <RightOutlined
        style={{
          color: token.colorTextQuaternary,
          fontSize: 10,
          flexShrink: 0,
        }}
      />
    </Link>
  )
}
