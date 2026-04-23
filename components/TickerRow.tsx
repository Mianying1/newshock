'use client'
import { useState } from 'react'
import Link from 'next/link'

export interface TickerRowBadge {
  label: string
  title?: string
}

interface Props {
  href: string
  rank?: number
  symbol: string
  logoUrl?: string | null
  rightText?: string
  rightSmall?: string
  sentiment?: 'bullish' | 'mixed' | 'bearish' | 'neutral' | null
  inlineBadges?: TickerRowBadge[]     // shown next to symbol (🤖 · 📰)
  rightBadge?: TickerRowBadge | null  // 灰底浅字 category/sector 标签
  compact?: boolean
}

const SENTIMENT_DOT: Record<string, { color: string; glyph: string }> = {
  bullish: { color: '#10b981', glyph: '●' },
  mixed: { color: '#a1a1aa', glyph: '●' },
  bearish: { color: '#f43f5e', glyph: '●' },
  neutral: { color: '#d4d4d8', glyph: '○' },
}

function TickerLogo({ symbol, logoUrl, size = 24 }: { symbol: string; logoUrl?: string | null; size?: number }) {
  const [errored, setErrored] = useState(false)
  const show = logoUrl && !errored
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size,
        background: '#f4f4f5',
        border: '1px solid #e4e4e7',
        overflow: 'hidden',
        flexShrink: 0,
        fontSize: size <= 20 ? 9 : 10,
        fontWeight: 600,
        color: '#71717a',
        letterSpacing: -0.2,
      }}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl as string}
          alt=""
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setErrored(true)}
        />
      ) : (
        <span>{symbol.slice(0, 2)}</span>
      )}
    </span>
  )
}

function SectorBadge({ label, title }: { label: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        background: '#f4f4f5',
        color: '#71717a',
        fontSize: 10.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}

export default function TickerRow({
  href,
  rank,
  symbol,
  logoUrl,
  rightText,
  rightSmall,
  sentiment,
  inlineBadges,
  rightBadge,
  compact = false,
}: Props) {
  const sent = sentiment ? SENTIMENT_DOT[sentiment] ?? SENTIMENT_DOT.neutral : null
  const logoSize = compact ? 20 : 24

  return (
    <Link href={href} className="ticker-row">
      {rank !== undefined && (
        <span
          style={{
            flexShrink: 0,
            width: 22,
            textAlign: 'right',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10.5,
            color: '#a1a1aa',
          }}
        >
          {rank}
        </span>
      )}
      <TickerLogo symbol={symbol} logoUrl={logoUrl} size={logoSize} />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: '#18181b',
          fontSize: compact ? 13 : 14,
        }}
      >
        <span>{symbol}</span>
        {sent && (
          <span
            style={{ color: sent.color, fontSize: 11, lineHeight: 1 }}
            title={sentiment ?? 'neutral'}
          >
            {sent.glyph}
          </span>
        )}
        {inlineBadges?.map((b, i) => (
          <span
            key={`${b.label}-${i}`}
            title={b.title}
            style={{
              fontSize: 11,
              color: '#71717a',
              fontWeight: 400,
              whiteSpace: 'nowrap',
            }}
          >
            {b.label}
          </span>
        ))}
      </span>
      <span style={{ flex: 1 }} />
      {rightBadge && <SectorBadge label={rightBadge.label} title={rightBadge.title} />}
      {rightText && (
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            fontWeight: 500,
            color: '#18181b',
            textAlign: 'right',
            flexShrink: 0,
            minWidth: 42,
          }}
        >
          {rightText}
          {rightSmall && (
            <small
              style={{ color: '#a1a1aa', fontWeight: 400, fontSize: 10, marginLeft: 2 }}
            >
              {rightSmall}
            </small>
          )}
        </span>
      )}
      <span style={{ color: '#d4d4d8', flexShrink: 0, fontSize: 14 }}>›</span>
    </Link>
  )
}
