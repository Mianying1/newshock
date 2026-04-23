'use client'
import Link from 'next/link'
import { TickerBadge } from '@/components/TickerBadge'
import { useI18n } from '@/lib/i18n-context'
import type { LongShortTickerRow } from '@/lib/ticker-scoring'

interface Props {
  row: LongShortTickerRow
  rank: number
}

const SENTIMENT_DOT: Record<string, { color: string; label: string }> = {
  bullish: { color: 'text-emerald-500', label: '●' },
  mixed: { color: 'text-zinc-400', label: '●' },
  bearish: { color: 'text-rose-500', label: '●' },
  neutral: { color: 'text-zinc-300', label: '○' },
}

const TICKER_TYPE_STYLE: Record<string, string> = {
  core_hold: 'bg-blue-50 text-blue-700 border-blue-200',
  short_catalyst: 'bg-amber-50 text-amber-700 border-amber-200',
  watch: 'bg-zinc-50 text-zinc-600 border-zinc-200',
  golden_leap: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function LongShortTickerCard({ row, rank }: Props) {
  const { t } = useI18n()

  const sent = SENTIMENT_DOT[row.dominant_sentiment ?? 'neutral'] ?? SENTIMENT_DOT.neutral
  const typeStyle = row.ticker_type ? TICKER_TYPE_STYLE[row.ticker_type] ?? 'bg-zinc-50 text-zinc-600 border-zinc-200' : ''
  const typeLabel = row.ticker_type
    ? t(`ticker_type.${row.ticker_type}`)
    : null

  return (
    <Link
      href={`/tickers/${row.symbol}`}
      className="block border border-zinc-200 rounded-lg p-4 hover:border-zinc-400 hover:bg-zinc-50 transition"
    >
      <div className="flex items-start gap-3">
        <span className="text-sm font-mono text-zinc-400 w-8 shrink-0 mt-1">
          {t('tickers_ranked.rank_prefix', { n: rank })}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <TickerBadge
                symbol={row.symbol}
                name={row.company_name ?? undefined}
                logoUrl={row.logo_url}
                size="md"
                showName
              />
              <span className={`${sent.color} text-sm leading-none`} title={row.dominant_sentiment ?? 'neutral'}>
                {sent.label}
              </span>
            </div>
            <span className="font-mono font-semibold text-lg text-zinc-900 shrink-0">
              {row.ticker_maturity_score?.toFixed(1) ?? '-'}
            </span>
          </div>

          <p className="text-xs text-zinc-600 mt-1 truncate">
            {row.theme_name}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            {typeLabel && (
              <span className={`px-2 py-0.5 rounded border font-medium ${typeStyle}`}>
                {typeLabel}
              </span>
            )}
            {row.sector && <span className="text-zinc-400">· {row.sector}</span>}
            {row.theme_strength_score !== null && (
              <span className="text-zinc-400">
                · {t('tickers_ranked.theme_strength', { n: row.theme_strength_score })}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
