'use client'
import { useState } from 'react'

interface Props {
  symbol: string
  name?: string
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
}

const sizeMap = {
  sm: { wh: 'w-5 h-5', text: 'text-xs' },
  md: { wh: 'w-7 h-7', text: 'text-sm' },
  lg: { wh: 'w-9 h-9', text: 'text-base' },
}

const FALLBACK_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
]

function getFallbackColor(symbol: string): string {
  return FALLBACK_COLORS[symbol.charCodeAt(0) % FALLBACK_COLORS.length]
}

export function TickerBadge({ symbol, name, logoUrl, size = 'md', showName = false }: Props) {
  const [imgError, setImgError] = useState(false)
  const { wh, text } = sizeMap[size]
  const fallbackColor = getFallbackColor(symbol)

  return (
    <div className="inline-flex items-center gap-1.5">
      {logoUrl && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={symbol}
          className={`${wh} rounded bg-white border border-zinc-200 object-contain flex-shrink-0`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={`${wh} rounded ${fallbackColor} flex items-center justify-center font-semibold ${text} flex-shrink-0`}
        >
          {symbol[0]}
        </div>
      )}
      <span className={`font-mono font-semibold ${text} text-zinc-900`}>${symbol}</span>
      {showName && name && name !== symbol && (
        <span className={`text-zinc-500 ${text} hidden md:inline truncate max-w-[160px]`}>
          {name}
        </span>
      )}
    </div>
  )
}
