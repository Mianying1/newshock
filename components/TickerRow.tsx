'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'

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

function symbolBg(symbol: string): string {
  // deterministic muted palette · consistent per-ticker
  const palette = ['#52525b', '#57534e', '#475569', '#4b5563', '#5b6670', '#6b6158']
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

function TickerLogo({ symbol, logoUrl, size = 24 }: { symbol: string; logoUrl?: string | null; size?: number }) {
  const sources: string[] = []
  if (logoUrl) sources.push(logoUrl)
  sources.push(`https://financialmodelingprep.com/image-stock/${symbol}.png`)
  sources.push(`https://logo.clearbit.com/${symbol.toLowerCase()}.com`)

  const [srcIdx, setSrcIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  const showImg = !failed && srcIdx < sources.length
  const initials = symbol.slice(0, Math.min(3, symbol.length))

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
        background: showImg ? '#ffffff' : symbolBg(symbol),
        border: showImg ? '1px solid #e4e4e7' : 'none',
        overflow: 'hidden',
        flexShrink: 0,
        fontSize: size <= 20 ? 8 : 9,
        fontWeight: 700,
        color: '#ffffff',
        letterSpacing: -0.2,
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={sources[srcIdx]}
          src={sources[srcIdx]}
          alt=""
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#ffffff' }}
          referrerPolicy="no-referrer"
          onError={() => {
            if (srcIdx < sources.length - 1) setSrcIdx(srcIdx + 1)
            else setFailed(true)
          }}
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth === 0 || img.naturalHeight === 0) {
              if (srcIdx < sources.length - 1) setSrcIdx(srcIdx + 1)
              else setFailed(true)
            }
          }}
        />
      ) : (
        <span style={{ color: '#ffffff' }}>{initials}</span>
      )}
    </span>
  )
}

function SectorBadge({ label, title }: { label: ReactNode; title?: string }) {
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
            key={i}
            title={b.title}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
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
