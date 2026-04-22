'use client'
import useSWR from 'swr'
import { useState } from 'react'
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
  raw_data: Record<string, unknown> | null
}

interface SeriesPoint {
  date: string
  value: number
}

const SERIES_BY_DIMENSION: Record<string, string | null> = {
  earnings: null,
  valuation: null,
  fed: 'FEDFUNDS',
  economic: 'UNRATE',
  credit: 'HY_OAS',
  sentiment: 'VIX',
}

function Dots({ score }: { score: number }) {
  const cls = (i: number) => {
    if (i < score) {
      if (score === 2) return 'bg-emerald-500'
      if (score === 1) return 'bg-amber-500'
      return 'bg-rose-500'
    }
    return 'bg-zinc-200'
  }
  return (
    <div className="flex gap-1">
      {[0, 1].map((i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${cls(i)}`} />
      ))}
    </div>
  )
}

function Sparkline({ points, score }: { points: SeriesPoint[]; score: number }) {
  if (points.length < 2) return null
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 80
  const h = 24
  const step = w / (points.length - 1)
  const pathPoints = points
    .map((p, i) => {
      const x = i * step
      const y = h - ((p.value - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const color = score === 2 ? '#10b981' : score === 1 ? '#f59e0b' : '#f43f5e'
  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline points={pathPoints} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

function DimensionRow({
  labelKey,
  score,
  reasoning,
  seriesIndicator,
  expanded,
  onToggle,
}: {
  labelKey: string
  score: number
  reasoning: string | null
  seriesIndicator: string | null
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  const { data: seriesData } = useSWR<{ points: SeriesPoint[] }>(
    expanded && seriesIndicator ? `/api/regime/series?indicator=${seriesIndicator}` : null,
    fetcher
  )
  const scoreColor =
    score === 2 ? 'text-emerald-600' : score === 1 ? 'text-amber-600' : 'text-rose-600'

  return (
    <div className="py-2 border-b border-zinc-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="w-16 text-xs text-zinc-600">{t(`market_regime.${labelKey}`)}</span>
        <span className={`w-4 text-xs font-semibold ${scoreColor}`}>{score}</span>
        <Dots score={score} />
        <span className="flex-1 text-xs text-zinc-500 truncate">{reasoning}</span>
        <span className="text-xs text-zinc-300">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="mt-2 pl-[76px] pr-2">
          {seriesIndicator ? (
            seriesData && seriesData.points.length >= 2 ? (
              <div className="flex items-center gap-3">
                <Sparkline points={seriesData.points} score={score} />
                <span className="text-[10px] text-zinc-400">
                  {seriesIndicator} · {seriesData.points.length}m
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-zinc-400">
                {t('market_regime.sparkline_unavailable')}
              </span>
            )
          ) : (
            <span className="text-[10px] text-zinc-400">{reasoning}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function MarketRegimeCard() {
  const { t, locale } = useI18n()
  const [expanded, setExpanded] = useState<string | null>(null)
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

  const dims: Array<{ key: string; score: number; reasoning: string | null }> = [
    { key: 'earnings', score: snap.earnings_score, reasoning: pickField(locale, snap.earnings_reasoning, snap.earnings_reasoning_zh) },
    { key: 'valuation', score: snap.valuation_score, reasoning: pickField(locale, snap.valuation_reasoning, snap.valuation_reasoning_zh) },
    { key: 'fed', score: snap.fed_score, reasoning: pickField(locale, snap.fed_reasoning, snap.fed_reasoning_zh) },
    { key: 'economic', score: snap.economic_score, reasoning: pickField(locale, snap.economic_reasoning, snap.economic_reasoning_zh) },
    { key: 'credit', score: snap.credit_score, reasoning: pickField(locale, snap.credit_reasoning, snap.credit_reasoning_zh) },
    { key: 'sentiment', score: snap.sentiment_score, reasoning: pickField(locale, snap.sentiment_reasoning, snap.sentiment_reasoning_zh) },
  ]

  return (
    <section className="py-4 border-b border-zinc-100 mb-2">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {t('market_regime.title')}
        </h2>
        <span className="text-[10px] text-zinc-400">
          {t('market_regime.updated_label', { date: snap.snapshot_date })}
        </span>
      </div>

      <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xl font-semibold text-zinc-900">{snap.total_score}</span>
          <span className="text-sm text-zinc-400">{t('market_regime.score_suffix')}</span>
          <span className="ml-auto text-xs font-medium text-zinc-700">
            {t(`market_regime.regime_label.${snap.regime_label}`)}
          </span>
        </div>

        <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden mb-2">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>

        <p className="text-xs text-zinc-600 mb-3">
          <span className="text-zinc-400">{t('market_regime.guidance_label')}: </span>
          {t(`market_regime.guidance_text.${snap.configuration_guidance}`)}
        </p>

        <div className="pt-2 border-t border-zinc-200">
          {dims.map((d) => (
            <DimensionRow
              key={d.key}
              labelKey={d.key}
              score={d.score}
              reasoning={d.reasoning}
              seriesIndicator={SERIES_BY_DIMENSION[d.key] ?? null}
              expanded={expanded === d.key}
              onToggle={() => setExpanded((prev) => (prev === d.key ? null : d.key))}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
