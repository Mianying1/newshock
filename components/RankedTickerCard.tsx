'use client'
import Link from 'next/link'
import { TickerBadge } from '@/components/TickerBadge'
import { useI18n } from '@/lib/i18n-context'
import type { TickerScores } from '@/lib/ticker-scoring'

interface Props {
  ticker: TickerScores
  rank: number
  primaryKey: 'thematic' | 'momentum' | 'potential' | 'composite'
}

const SCORE_KEYS: Record<Props['primaryKey'], keyof TickerScores> = {
  thematic: 'thematic_score',
  momentum: 'momentum_score',
  potential: 'potential_score',
  composite: 'composite_score',
}

export default function RankedTickerCard({ ticker, rank, primaryKey }: Props) {
  const { t } = useI18n()
  const primaryScore = ticker[SCORE_KEYS[primaryKey]] as number
  const categoryLabel = ticker.dominant_category
    ? t(`categories.${ticker.dominant_category}`)
    : null

  return (
    <Link
      href={`/tickers/${ticker.symbol}`}
      className="block border border-zinc-200 rounded-lg p-4 hover:border-zinc-400 hover:bg-zinc-50 transition"
    >
      <div className="flex items-start gap-3">
        <span className="text-sm font-mono text-zinc-400 w-8 shrink-0 mt-1">
          {t('tickers_ranked.rank_prefix', { n: rank })}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <TickerBadge
              symbol={ticker.symbol}
              name={ticker.company_name}
              logoUrl={ticker.logo_url}
              size="md"
              showName
            />
            <span className="font-mono font-semibold text-lg text-zinc-900 shrink-0">
              {primaryScore.toFixed(1)}
            </span>
          </div>

          <p className="text-xs text-zinc-500 mt-1 truncate">
            {ticker.sector && <span>{ticker.sector}</span>}
            {categoryLabel && (
              <>
                {ticker.sector && <span> · </span>}
                <span className="text-zinc-600">{categoryLabel}</span>
              </>
            )}
          </p>

          <div className="flex flex-wrap gap-3 mt-2 text-xs text-zinc-500">
            <span>
              {t('tickers_ranked.score_thematic')}{' '}
              <span className="font-mono text-zinc-700">{ticker.thematic_score.toFixed(1)}</span>
            </span>
            <span>
              {t('tickers_ranked.score_momentum')}{' '}
              <span className="font-mono text-zinc-700">{ticker.momentum_score.toFixed(1)}</span>
            </span>
            <span>
              {t('tickers_ranked.score_potential')}{' '}
              <span className="font-mono text-zinc-700">{ticker.potential_score.toFixed(1)}</span>
            </span>
            <span className="text-zinc-400">·</span>
            <span>{t('tickers_ranked.themes_count', { n: ticker.themes_count })}</span>
            <span>{t('tickers_ranked.events_7d', { n: ticker.recent_events_7d })}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
