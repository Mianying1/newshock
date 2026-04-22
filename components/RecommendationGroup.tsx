'use client'
import Link from 'next/link'
import type { ThemeRecommendation } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { TickerBadge } from '@/components/TickerBadge'

function capLabel(band: string | null, t: (k: string) => string): string | null {
  if (!band) return null
  if (band === 'small') return t('theme_detail.cap_small')
  if (band === 'mid') return t('theme_detail.cap_mid')
  if (band === 'large') return t('theme_detail.cap_large')
  return null
}

function confBandClass(b: string | null): string {
  if (b === 'high') return 'bg-emerald-50 text-emerald-700'
  if (b === 'medium') return 'bg-amber-50 text-amber-700'
  if (b === 'low') return 'bg-zinc-100 text-zinc-500'
  return ''
}

export function RecommendationCard({ r }: { r: ThemeRecommendation }) {
  const { t, locale } = useI18n()
  const reasoning = pickField(locale, r.role_reasoning, r.role_reasoning_zh)
  const exposure = pickField(locale, r.business_exposure, r.business_exposure_zh)
  const catalyst = pickField(locale, r.catalyst, r.catalyst_zh)
  const risk = pickField(locale, r.risk, r.risk_zh)
  const capText = capLabel(r.market_cap_band, t)

  return (
    <div className="border border-zinc-200 rounded-lg p-3 bg-white">
      <div className="flex items-start gap-2 flex-wrap">
        <Link href={`/tickers/${r.ticker_symbol}`} className="hover:opacity-80 transition">
          <TickerBadge
            symbol={r.ticker_symbol}
            name={r.company_name}
            logoUrl={r.logo_url}
            size="md"
            showName
          />
        </Link>
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {r.is_thematic_tool && (
            <span
              className="text-[10px] text-zinc-500 cursor-help"
              title={t('theme_detail.thematic_tool_tooltip')}
            >
              ⚙︎
            </span>
          )}
          {r.confidence_band && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${confBandClass(r.confidence_band)}`}
            >
              {r.confidence_band}
            </span>
          )}
          {capText && <span className="text-[10px] text-zinc-500">{capText}</span>}
        </div>
      </div>

      {reasoning.trim().length > 0 && (
        <p className="text-sm text-zinc-700 mt-2 leading-relaxed">{reasoning}</p>
      )}

      {exposure.trim().length > 0 && (
        <p className="text-xs text-zinc-500 mt-1.5">
          <span className="text-zinc-400">{t('theme_detail.exposure_label')}:</span> {exposure}
        </p>
      )}

      {catalyst.trim().length > 0 && (
        <p className="text-xs text-emerald-600 mt-1.5">
          ⚡ <span className="text-emerald-700 font-medium">{t('theme_detail.catalyst')}:</span> {catalyst}
        </p>
      )}

      {risk.trim().length > 0 && (
        <p className="text-xs text-amber-600 mt-1">
          ⚠ <span className="text-amber-700 font-medium">{t('theme_detail.risk')}:</span> {risk}
        </p>
      )}
    </div>
  )
}

export function RecommendationGroup({
  title,
  items,
  variant = 'default',
}: {
  title: string
  items: ThemeRecommendation[]
  variant?: 'default' | 'pressure' | 'headwind'
}) {
  if (items.length === 0) return null

  const wrapperClass =
    variant === 'headwind'
      ? 'mb-5 rounded-lg bg-rose-50 border border-rose-100 p-3'
      : variant === 'pressure'
        ? 'mb-5 rounded-lg bg-amber-50/60 border border-amber-100 p-3'
        : 'mb-5'

  const titleColor =
    variant === 'headwind'
      ? 'text-rose-700'
      : variant === 'pressure'
        ? 'text-amber-800'
        : 'text-zinc-800'

  return (
    <div className={wrapperClass}>
      <p className={`text-sm font-semibold mb-2 ${titleColor}`}>
        {title} <span className="text-zinc-400 font-normal">({items.length})</span>
      </p>
      <div className="space-y-2.5">
        {items.map((r) => (
          <RecommendationCard key={r.ticker_symbol} r={r} />
        ))}
      </div>
    </div>
  )
}
