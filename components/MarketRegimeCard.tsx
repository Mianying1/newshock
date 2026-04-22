'use client'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'

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

const DIMS: { key: string; labelKey: string; scoreField: keyof RegimeSnapshot }[] = [
  { key: 'earnings', labelKey: 'market_regime.earnings', scoreField: 'earnings_score' },
  { key: 'credit', labelKey: 'market_regime.credit', scoreField: 'credit_score' },
  { key: 'valuation', labelKey: 'market_regime.valuation', scoreField: 'valuation_score' },
  { key: 'fed', labelKey: 'market_regime.fed', scoreField: 'fed_score' },
  { key: 'economic', labelKey: 'market_regime.economic', scoreField: 'economic_score' },
  { key: 'sentiment', labelKey: 'market_regime.sentiment', scoreField: 'sentiment_score' },
]

function verdictClass(label: string) {
  if (label === 'expansion' || label === 'neutral_expansion') return 'expansion'
  if (label === 'stress') return 'stress'
  if (label === 'bear') return 'bear'
  return ''
}

function dimBar(score: number) {
  if (score === 2) return { cls: 'pos', width: 50, align: 'right' as const, valCls: 'pos' }
  if (score === 1) return { cls: 'pos', width: 25, align: 'right' as const, valCls: '' }
  if (score === 0) return { cls: 'neg', width: 50, align: 'left' as const, valCls: 'neg' }
  return { cls: '', width: 0, align: 'right' as const, valCls: '' }
}

export function MarketRegimeCard() {
  const { t } = useI18n()
  const { data } = useSWR<{ snapshot: RegimeSnapshot | null }>(
    '/api/regime/current',
    fetcher
  )
  const snap = data?.snapshot
  if (!snap) return null

  const pct = (snap.total_score / 12) * 100
  const verdict = verdictClass(snap.regime_label)
  const note = t(`market_regime.guidance_text.${snap.configuration_guidance}`)
  const regimeLabel = t(`market_regime.regime_label.${snap.regime_label}`)

  return (
    <>
      <div className="sec-label">
        <span className="l">{t('market_regime.title')}</span>
        <span className="r">{t('market_regime.scores_refresh_twice_weekly')}</span>
      </div>
      <div className="regime">
        <div className="regime-head">
          <div>
            <div className="regime-label">{t('market_regime.composite')}</div>
            <div className="regime-score">
              {snap.total_score}
              <span className="unit">/12</span>
            </div>
            <div className="regime-bar-main">
              <div className="regime-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="regime-note">{note}</div>
          </div>
          <span className={`regime-verdict${verdict ? ' ' + verdict : ''}`}>
            <span className="dot" />
            {regimeLabel}
          </span>
        </div>

        <div className="regime-bars">
          {DIMS.map((d) => {
            const score = snap[d.scoreField] as number
            const bar = dimBar(score)
            const fillStyle: React.CSSProperties = { width: `${bar.width}%` }
            if (bar.align === 'left') {
              fillStyle.left = 'auto'
              fillStyle.right = '50%'
            }
            return (
              <div className="rb" key={d.key}>
                <div className="rb-name">{t(d.labelKey)}</div>
                <div className="rb-track">
                  <div className="rb-mid" />
                  <div className={`rb-fill${bar.cls ? ' ' + bar.cls : ''}`} style={fillStyle} />
                </div>
                <div className={`rb-val${bar.valCls ? ' ' + bar.valCls : ''}`}>
                  {score}
                  <span className="rb-unit">/2</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
