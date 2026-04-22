import { supabaseAdmin } from './supabase-admin'

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

export interface FREDObservation {
  date: string
  value: number | null
}

export interface ManualInputs {
  updated_at: string
  spx_fwd_pe: number
  spx_cape: number
  spx_eps_yoy: number
  spx_eps_revision_trend: 'up' | 'stable' | 'down'
  aaii_bullish: number
  aaii_bearish: number
  fed_dot_plot_2026_end: number
  fed_dot_plot_2027_end: number
  fed_next_meeting_cuts_bps: number
  fed_cycle_stance: 'cutting' | 'on_hold_with_cuts_ahead' | 'on_hold' | 'hawkish_pivot' | 'hiking'
}

export interface DimensionScore {
  score: 0 | 1 | 2
  reasoning: string
  value: string
}

export interface EconomicDimensionScore extends DimensionScore {
  sub_indicators: {
    unrate: number | null
    payems_3mo_avg: number | null
    core_pce_yoy: number | null
    core_cpi_yoy: number | null
    wage_growth_yoy: number | null
  }
}

export interface RegimeScores {
  earnings: DimensionScore
  valuation: DimensionScore
  fed: DimensionScore
  economic: EconomicDimensionScore
  credit: DimensionScore
  sentiment: DimensionScore
  total: number
  label: string
  guidance: string
}

export const FRED_SERIES = {
  UNRATE: 'UNRATE',
  PAYEMS: 'PAYEMS',
  PCEPILFE: 'PCEPILFE',
  CPILFESL: 'CPILFESL',
  WAGES: 'CES0500000003',
  FEDFUNDS: 'FEDFUNDS',
  HY_OAS: 'BAMLH0A0HYM2',
  T10Y2Y: 'T10Y2Y',
  VIX: 'VIXCLS',
  CORP_PROFITS: 'CP',
  DGS10: 'DGS10',
} as const

export type FREDSeriesId = (typeof FRED_SERIES)[keyof typeof FRED_SERIES]

export async function fetchFREDIndicator(
  seriesId: string,
  monthsBack = 24
): Promise<FREDObservation[]> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) throw new Error('FRED_API_KEY not set')

  const start = new Date()
  start.setMonth(start.getMonth() - monthsBack)
  const observation_start = start.toISOString().slice(0, 10)

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${observation_start}&sort_order=asc`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED ${seriesId} → ${res.status}`)
  const body = (await res.json()) as { observations?: Array<{ date: string; value: string }> }
  return (body.observations ?? []).map((o) => ({
    date: o.date,
    value: o.value === '.' || o.value === '' ? null : Number(o.value),
  }))
}

function latest(obs: FREDObservation[]): FREDObservation | null {
  for (let i = obs.length - 1; i >= 0; i--) {
    if (obs[i].value !== null) return obs[i]
  }
  return null
}

function yoyChange(obs: FREDObservation[]): number | null {
  const last = latest(obs)
  if (!last || last.value === null) return null
  const yearAgo = new Date(last.date)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const yearAgoStr = yearAgo.toISOString().slice(0, 10)
  let closest: FREDObservation | null = null
  let bestDiff = Infinity
  for (const o of obs) {
    if (o.value === null) continue
    const diff = Math.abs(new Date(o.date).getTime() - new Date(yearAgoStr).getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      closest = o
    }
  }
  if (!closest || closest.value === null || closest.value === 0) return null
  return ((last.value - closest.value) / Math.abs(closest.value)) * 100
}

function threeMonthAverage(obs: FREDObservation[]): number | null {
  const valid = obs.filter((o) => o.value !== null).slice(-3)
  if (valid.length < 1) return null
  const sum = valid.reduce((a, b) => a + (b.value ?? 0), 0)
  return sum / valid.length
}

function payrollsMonthOverMonth(obs: FREDObservation[]): number[] {
  const valid = obs.filter((o) => o.value !== null).map((o) => o.value as number)
  const changes: number[] = []
  for (let i = 1; i < valid.length; i++) changes.push(valid[i] - valid[i - 1])
  return changes
}

function scoreEarnings(manual: ManualInputs): DimensionScore {
  const yoy = manual.spx_eps_yoy
  const trend = manual.spx_eps_revision_trend
  let score: 0 | 1 | 2 = 0
  if (yoy > 10 && trend !== 'down') score = 2
  else if (yoy >= 5 || trend === 'stable') score = 1
  const reasoning = `SPX EPS YoY ${yoy.toFixed(1)}% · revisions ${trend}`
  return { score, reasoning, value: `${yoy.toFixed(1)}% YoY` }
}

function scoreValuation(manual: ManualInputs): DimensionScore {
  const pe = manual.spx_fwd_pe
  const cape = manual.spx_cape
  let score: 0 | 1 | 2 = 0
  if (pe < 17 || cape < 25) score = 2
  else if (pe <= 20 || cape <= 30) score = 1
  const reasoning = `Fwd P/E ${pe.toFixed(2)} · CAPE ${cape.toFixed(1)}`
  return { score, reasoning, value: `Fwd P/E ${pe.toFixed(2)}` }
}

function scoreFed(manual: ManualInputs, fedFunds: FREDObservation[]): DimensionScore {
  const last = latest(fedFunds)
  const rate = last?.value ?? null
  const stance = manual.fed_cycle_stance
  let score: 0 | 1 | 2 = 0
  if (stance === 'cutting') score = 2
  else if (stance === 'on_hold_with_cuts_ahead' || stance === 'on_hold') score = 1
  else score = 0
  const rateStr = rate !== null ? `${rate.toFixed(2)}%` : 'n/a'
  const reasoning = `Fed Funds ${rateStr} · ${stance.replace(/_/g, ' ')}`
  return { score, reasoning, value: rateStr }
}

function scoreEconomic(series: {
  unrate: FREDObservation[]
  payems: FREDObservation[]
  corePCE: FREDObservation[]
  coreCPI: FREDObservation[]
  wages: FREDObservation[]
}): EconomicDimensionScore {
  const unrate = latest(series.unrate)?.value ?? null
  const payemsChanges = payrollsMonthOverMonth(series.payems)
  const payems3moAvg =
    payemsChanges.length >= 3
      ? (payemsChanges.slice(-3).reduce((a, b) => a + b, 0) / 3) * 1000
      : null
  const corePceYoy = yoyChange(series.corePCE)
  const coreCpiYoy = yoyChange(series.coreCPI)
  const wageYoy = yoyChange(series.wages)

  const jobsStable = unrate !== null && unrate < 4.5 && (payems3moAvg === null || payems3moAvg > 50_000)
  const inflationCooling = corePceYoy !== null && corePceYoy < 3.0
  const inflationRising = corePceYoy !== null && corePceYoy > 4.0
  const jobsBad = unrate !== null && (unrate >= 4.5 || (payems3moAvg !== null && payems3moAvg < 50_000))

  let score: 0 | 1 | 2 = 1
  if (jobsBad || inflationRising) score = 0
  else if (jobsStable && inflationCooling) score = 2

  const pieces: string[] = []
  if (unrate !== null) pieces.push(`UNRATE ${unrate.toFixed(1)}%`)
  if (corePceYoy !== null) pieces.push(`Core PCE ${corePceYoy.toFixed(1)}%`)
  if (wageYoy !== null) pieces.push(`Wage ${wageYoy.toFixed(1)}%`)
  const reasoning = pieces.join(' · ') || 'insufficient data'

  return {
    score,
    reasoning,
    value: unrate !== null ? `UNRATE ${unrate.toFixed(1)}%` : 'n/a',
    sub_indicators: {
      unrate,
      payems_3mo_avg: payems3moAvg,
      core_pce_yoy: corePceYoy,
      core_cpi_yoy: coreCpiYoy,
      wage_growth_yoy: wageYoy,
    },
  }
}

function scoreCredit(hyOas: FREDObservation[], t10y2y: FREDObservation[]): DimensionScore {
  const lastHy = latest(hyOas)
  const hy = lastHy?.value ?? null
  const spread = latest(t10y2y)?.value ?? null
  let score: 0 | 1 | 2 = 1
  if (hy !== null) {
    if (hy < 3.5) score = 2
    else if (hy <= 5) score = 1
    else score = 0
  }
  const hyStr = hy !== null ? `${hy.toFixed(2)}%` : 'n/a'
  const spreadStr = spread !== null ? `${spread.toFixed(2)}%` : 'n/a'
  return {
    score,
    reasoning: `HY OAS ${hyStr} · 10Y-2Y ${spreadStr}`,
    value: `HY OAS ${hyStr}`,
  }
}

function scoreSentiment(vix: FREDObservation[], manual: ManualInputs): DimensionScore {
  const vLast = latest(vix)?.value ?? null
  const bull = manual.aaii_bullish
  const bear = manual.aaii_bearish
  const aaiiExtreme = bull > 50 || bear > 50
  let score: 0 | 1 | 2 = 1
  if (vLast !== null) {
    if (vLast > 25 || aaiiExtreme) score = 0
    else if (vLast < 15 && !aaiiExtreme) score = 2
    else score = 1
  }
  const vStr = vLast !== null ? vLast.toFixed(1) : 'n/a'
  return {
    score,
    reasoning: `VIX ${vStr} · AAII ${bull}/${bear}`,
    value: `VIX ${vStr}`,
  }
}

export function labelFor(total: number): { label: string; guidance: string } {
  if (total >= 9) return { label: 'expansion', guidance: 'maintain_equity' }
  if (total >= 7) return { label: 'neutral_expansion', guidance: 'hold_no_leverage' }
  if (total >= 5) return { label: 'watch', guidance: 'reduce_beta' }
  if (total >= 3) return { label: 'stress', guidance: 'heavy_reduce' }
  return { label: 'bear', guidance: 'defensive' }
}

export interface RegimeInputs {
  manual: ManualInputs
  fedFunds: FREDObservation[]
  unrate: FREDObservation[]
  payems: FREDObservation[]
  corePCE: FREDObservation[]
  coreCPI: FREDObservation[]
  wages: FREDObservation[]
  hyOas: FREDObservation[]
  t10y2y: FREDObservation[]
  vix: FREDObservation[]
}

export function computeRegimeScores(inputs: RegimeInputs): RegimeScores {
  const earnings = scoreEarnings(inputs.manual)
  const valuation = scoreValuation(inputs.manual)
  const fed = scoreFed(inputs.manual, inputs.fedFunds)
  const economic = scoreEconomic({
    unrate: inputs.unrate,
    payems: inputs.payems,
    corePCE: inputs.corePCE,
    coreCPI: inputs.coreCPI,
    wages: inputs.wages,
  })
  const credit = scoreCredit(inputs.hyOas, inputs.t10y2y)
  const sentiment = scoreSentiment(inputs.vix, inputs.manual)

  const total =
    earnings.score + valuation.score + fed.score + economic.score + credit.score + sentiment.score
  const { label, guidance } = labelFor(total)

  return { earnings, valuation, fed, economic, credit, sentiment, total, label, guidance }
}

async function upsertSeries(indicator: string, obs: FREDObservation[]): Promise<void> {
  const rows = obs
    .filter((o) => o.value !== null)
    .map((o) => ({ indicator, date: o.date, value: o.value }))
  if (rows.length === 0) return

  const chunk = 500
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    await supabaseAdmin.from('market_regime_series').upsert(slice, { onConflict: 'indicator,date' })
  }
}

export async function updateRegimeSnapshot(
  manual: ManualInputs
): Promise<{ snapshot_date: string; scores: RegimeScores }> {
  const [
    fedFunds,
    unrate,
    payems,
    corePCE,
    coreCPI,
    wages,
    hyOas,
    t10y2y,
    vix,
  ] = await Promise.all([
    fetchFREDIndicator(FRED_SERIES.FEDFUNDS),
    fetchFREDIndicator(FRED_SERIES.UNRATE),
    fetchFREDIndicator(FRED_SERIES.PAYEMS),
    fetchFREDIndicator(FRED_SERIES.PCEPILFE),
    fetchFREDIndicator(FRED_SERIES.CPILFESL),
    fetchFREDIndicator(FRED_SERIES.WAGES),
    fetchFREDIndicator(FRED_SERIES.HY_OAS),
    fetchFREDIndicator(FRED_SERIES.T10Y2Y),
    fetchFREDIndicator(FRED_SERIES.VIX),
  ])

  await Promise.all([
    upsertSeries('FEDFUNDS', fedFunds),
    upsertSeries('UNRATE', unrate),
    upsertSeries('PAYEMS', payems),
    upsertSeries('CORE_PCE', corePCE),
    upsertSeries('CORE_CPI', coreCPI),
    upsertSeries('WAGES', wages),
    upsertSeries('HY_OAS', hyOas),
    upsertSeries('T10Y2Y', t10y2y),
    upsertSeries('VIX', vix),
  ])

  const scores = computeRegimeScores({
    manual,
    fedFunds,
    unrate,
    payems,
    corePCE,
    coreCPI,
    wages,
    hyOas,
    t10y2y,
    vix,
  })

  const snapshot_date = new Date().toISOString().slice(0, 10)

  const rawData = {
    manual,
    latest: {
      fed_funds: latest(fedFunds),
      unrate: latest(unrate),
      payems: latest(payems),
      core_pce_yoy: yoyChange(corePCE),
      core_cpi_yoy: yoyChange(coreCPI),
      wages_yoy: yoyChange(wages),
      hy_oas: latest(hyOas),
      t10y2y: latest(t10y2y),
      vix: latest(vix),
      payems_3mo_avg_jobs: threeMonthAverage(payems),
    },
    sub_indicators: scores.economic.sub_indicators,
  }

  await supabaseAdmin.from('market_regime_snapshots').upsert(
    {
      snapshot_date,
      earnings_score: scores.earnings.score,
      valuation_score: scores.valuation.score,
      fed_score: scores.fed.score,
      economic_score: scores.economic.score,
      credit_score: scores.credit.score,
      sentiment_score: scores.sentiment.score,
      total_score: scores.total,
      regime_label: scores.label,
      configuration_guidance: scores.guidance,
      earnings_reasoning: scores.earnings.reasoning,
      valuation_reasoning: scores.valuation.reasoning,
      fed_reasoning: scores.fed.reasoning,
      economic_reasoning: scores.economic.reasoning,
      credit_reasoning: scores.credit.reasoning,
      sentiment_reasoning: scores.sentiment.reasoning,
      raw_data: rawData,
    },
    { onConflict: 'snapshot_date' }
  )

  return { snapshot_date, scores }
}
