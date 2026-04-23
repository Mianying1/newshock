'use client'
import { useState } from 'react'
import Link from 'next/link'

type BadgeTone = 'long' | 'short' | 'watch' | 'pending' | 'neutral'

export interface TickerRowBadge {
  label: string
  tone: BadgeTone
  title?: string
}

interface Props {
  href: string
  rank?: number
  symbol: string
  logoUrl?: string | null
  subtitle?: string
  rightText?: string
  rightSmall?: string
  sentiment?: 'bullish' | 'mixed' | 'bearish' | 'neutral' | null
  badges?: TickerRowBadge[]
  compact?: boolean
}

const SENTIMENT_DOT: Record<string, { color: string; glyph: string }> = {
  bullish: { color: '#10b981', glyph: '●' },
  mixed: { color: '#a1a1aa', glyph: '●' },
  bearish: { color: '#f43f5e', glyph: '●' },
  neutral: { color: '#d4d4d8', glyph: '○' },
}

const BADGE_STYLE: Record<BadgeTone, { bg: string; color: string; border: string }> = {
  long: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  short: { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  watch: { bg: '#fafafa', color: '#52525b', border: '#e4e4e7' },
  pending: { bg: '#f5f3ff', color: '#6d28d9', border: '#c4b5fd' },
  neutral: { bg: '#fafafa', color: '#71717a', border: '#e4e4e7' },
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

export default function TickerRow({
  href,
  rank,
  symbol,
  logoUrl,
  subtitle,
  rightText,
  rightSmall,
  sentiment,
  badges,
  compact = false,
}: Props) {
  const sent = sentiment ? SENTIMENT_DOT[sentiment] ?? SENTIMENT_DOT.neutral : null

  if (compact) {
    return (
      <Link href={href} className="rank-row">
        {rank !== undefined && <div className="n">{rank}</div>}
        <TickerLogo symbol={symbol} logoUrl={logoUrl} size={20} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="sym"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
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
            {badges?.map((b, i) => {
              const style = BADGE_STYLE[b.tone]
              return (
                <span
                  key={`${b.label}-${i}`}
                  title={b.title}
                  style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 3,
                    border: `1px solid ${style.border}`,
                    color: style.color,
                    background: style.bg,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  {b.label}
                </span>
              )
            })}
          </div>
          {subtitle && (
            <div
              className="nm"
              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {subtitle}
            </div>
          )}
        </div>
        {rightText && (
          <div className="sc">
            {rightText}
            {rightSmall && <small>{rightSmall}</small>}
          </div>
        )}
        <div className="more">›</div>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className="block border border-zinc-200 rounded-lg p-4 hover:border-zinc-400 hover:bg-zinc-50 transition"
    >
      <div className="flex items-start gap-3">
        {rank !== undefined && (
          <span className="text-sm font-mono text-zinc-400 w-8 shrink-0 mt-1">#{rank}</span>
        )}
        <TickerLogo symbol={symbol} logoUrl={logoUrl} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-semibold text-zinc-900">{symbol}</span>
              {sent && (
                <span
                  style={{ color: sent.color }}
                  className="text-sm leading-none"
                  title={sentiment ?? 'neutral'}
                >
                  {sent.glyph}
                </span>
              )}
            </div>
            {rightText && (
              <span className="font-mono font-semibold text-lg text-zinc-900 shrink-0">
                {rightText}
                {rightSmall && <small className="text-zinc-400 ml-0.5">{rightSmall}</small>}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-zinc-600 mt-1 truncate">{subtitle}</p>}
          {badges && badges.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              {badges.map((b, i) => {
                const style = BADGE_STYLE[b.tone]
                return (
                  <span
                    key={`${b.label}-${i}`}
                    title={b.title}
                    className="px-2 py-0.5 rounded border font-medium"
                    style={{ background: style.bg, color: style.color, borderColor: style.border }}
                  >
                    {b.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
