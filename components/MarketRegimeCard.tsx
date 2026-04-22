'use client'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface RegimeSnapshot {
  snapshot_date: string
  earnings_score: number
  valuation_score: number
  fed_score: number
  economic_score: number
  credit_score: number
  sentiment_score: number
  total_score: number
  regime_label: string
  regime_label_zh: string | null
  configuration_guidance: string
  configuration_guidance_zh: string | null
  earnings_reasoning: string | null
  earnings_reasoning_zh: string | null
  valuation_reasoning: string | null
  valuation_reasoning_zh: string | null
  fed_reasoning: string | null
  fed_reasoning_zh: string | null
  economic_reasoning: string | null
  economic_reasoning_zh: string | null
  credit_reasoning: string | null
  credit_reasoning_zh: string | null
  sentiment_reasoning: string | null
  sentiment_reasoning_zh: string | null
}

const DIM_ORDER = ['earnings', 'valuation', 'fed', 'credit', 'economic', 'sentiment'] as const

function scoreColors(score: number) {
  if (score === 2) return { bar: 'bg-emerald-500', text: 'text-emerald-600' }
  if (score === 1) return { bar: 'bg-amber-500', text: 'text-amber-600' }
  return { bar: 'bg-rose-500', text: 'text-rose-600' }
}

function DimensionCell({
  labelKey,
  score,
  reasoning,
}: {
  labelKey: string
  score: number
  reasoning: string | null
}) {
  const { t } = useI18n()
  const { bar, text } = scoreColors(score)
  return (
    <div className="py-3 px-4 border-r border-b border-zinc-100 last:border-r-0 md:[&:nth-child(3n)]:border-r-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-zinc-700">{t(`market_regime.${labelKey}`)}</span>
        <span className={`text-sm font-mono font-semibold ${text}`}>
          {score}
          <span className="text-zinc-300 text-xs">/2</span>
        </span>
      </div>
      <div className="flex gap-0.5 mb-1.5">
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`flex-1 h-1 rounded-sm ${i < score ? bar : 'bg-zinc-100'}`}
          />
        ))}
      </div>
      {reasoning && (
        <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2">{reasoning}</p>
      )}
    </div>
  )
}

export function MarketRegimeCard() {
  const { t, locale } = useI18n()
  const { data } = useSWR<{ snapshot: RegimeSnapshot | null }>('/api/regime/current', fetcher)

  const snap = data?.snapshot
  if (!snap) return null

  const pct = (snap.total_score / 12) * 100
  const barColor =
    snap.total_score >= 9
      ? 'bg-emerald-500'
      : snap.total_score >= 7
      ? 'bg-emerald-400'
      : snap.total_score >= 5
      ? 'bg-amber-500'
      : snap.total_score >= 3
      ? 'bg-rose-500'
      : 'bg-rose-700'

  const dimReasoning: Record<string, string | null> = {
    earnings: pickField(locale, snap.earnings_reasoning, snap.earnings_reasoning_zh),
    valuation: pickField(locale, snap.valuation_reasoning, snap.valuation_reasoning_zh),
    fed: pickField(locale, snap.fed_reasoning, snap.fed_reasoning_zh),
    economic: pickField(locale, snap.economic_reasoning, snap.economic_reasoning_zh),
    credit: pickField(locale, snap.credit_reasoning, snap.credit_reasoning_zh),
    sentiment: pickField(locale, snap.sentiment_reasoning, snap.sentiment_reasoning_zh),
  }
  const dimScore: Record<string, number> = {
    earnings: snap.earnings_score,
    valuation: snap.valuation_score,
    fed: snap.fed_score,
    economic: snap.economic_score,
    credit: snap.credit_score,
    sentiment: snap.sentiment_score,
  }

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {t('market_regime.title')}
        </h2>
        <span className="text-[11px] text-zinc-400">
          {t('market_regime.scores_refresh_twice_weekly')}
        </span>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-zinc-100">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">
                {t('market_regime.composite')}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-mono font-semibold text-zinc-900">
                  {snap.total_score}
                </span>
                <span className="text-base text-zinc-400 font-mono">/12</span>
              </div>
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded border bg-zinc-50 border-zinc-200 text-zinc-700">
              {t(`market_regime.regime_label.${snap.regime_label}`)}
            </span>
          </div>

          <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden mb-3">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            <span className="text-zinc-400">{t('market_regime.guidance_label')}: </span>
            {t(`market_regime.guidance_text.${snap.configuration_guidance}`)}
          </p>
        </div>

        <div className="flex items-center justify-between px-5 py-2 text-[11px] text-zinc-400 bg-zinc-50/50">
          <span className="uppercase tracking-widest">{t('market_regime.six_dimensions')}</span>
          <span>{t('market_regime.updated_daily_dimensions', { date: snap.snapshot_date })}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3">
          {DIM_ORDER.map((k) => (
            <DimensionCell
              key={k}
              labelKey={k}
              score={dimScore[k]}
              reasoning={dimReasoning[k]}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
