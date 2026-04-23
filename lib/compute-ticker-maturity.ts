import { supabaseAdmin } from './supabase-admin'

const W_ARCHETYPE = 0.30
const W_THEME_ACTIVE = 0.25
const W_EVENT_90D = 0.25
const W_AVG_STRENGTH = 0.20
const EPS = 1e-6

if (Math.abs(W_ARCHETYPE + W_THEME_ACTIVE + W_EVENT_90D + W_AVG_STRENGTH - 1.0) > EPS) {
  throw new Error('weights do not sum to 1.0')
}

type Rec = { ticker_symbol: string; theme_id: string }
type Theme = { id: string; status: string; archetype_id: string | null; theme_strength_score: number | null }
type Event = { trigger_theme_id: string | null; created_at: string }

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const all: T[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabaseAdmin.from(table).select(cols).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as unknown as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function buildNormalizer(values: number[]): (v: number) => number {
  if (values.length === 0) return () => 0
  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const mid = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]

  return (v: number): number => {
    if (max === min) return 5
    if (v <= min) return 0
    if (v >= max) return 10
    if (v <= mid) {
      if (mid === min) return 5
      return ((v - min) / (mid - min)) * 5
    }
    if (max === mid) return 5
    return 5 + ((v - mid) / (max - mid)) * 5
  }
}

export interface ComputeTickerMaturityStats {
  scored_count: number
  updated_rows: number
  top_5: Array<{ ticker: string; score: number }>
  bottom_5: Array<{ ticker: string; score: number }>
}

export async function runComputeTickerMaturity(): Promise<ComputeTickerMaturityStats> {
  const [recs, themes, events] = await Promise.all([
    fetchAll<Rec>('theme_recommendations', 'ticker_symbol, theme_id'),
    fetchAll<Theme>('themes', 'id, status, archetype_id, theme_strength_score'),
    fetchAll<Event>('events', 'trigger_theme_id, created_at'),
  ])

  const themeById = new Map<string, Theme>()
  for (const t of themes) themeById.set(t.id, t)

  const now = Date.now()
  const D90 = now - 90 * 86400 * 1000
  const evt90ByTheme = new Map<string, number>()
  for (const e of events) {
    if (!e.trigger_theme_id) continue
    if (new Date(e.created_at).getTime() >= D90) {
      evt90ByTheme.set(e.trigger_theme_id, (evt90ByTheme.get(e.trigger_theme_id) ?? 0) + 1)
    }
  }

  type Agg = {
    ticker: string
    archetype_ids: Set<string>
    active_theme_ids: Set<string>
    theme_ids: Set<string>
    strength_sum: number
    strength_count: number
  }
  const perTicker = new Map<string, Agg>()
  for (const r of recs) {
    const t = themeById.get(r.theme_id)
    if (!t) continue
    let a = perTicker.get(r.ticker_symbol)
    if (!a) {
      a = {
        ticker: r.ticker_symbol,
        archetype_ids: new Set(),
        active_theme_ids: new Set(),
        theme_ids: new Set(),
        strength_sum: 0,
        strength_count: 0,
      }
      perTicker.set(r.ticker_symbol, a)
    }
    if (t.archetype_id) a.archetype_ids.add(t.archetype_id)
    a.theme_ids.add(t.id)
    if (t.status === 'active') {
      a.active_theme_ids.add(t.id)
      if (typeof t.theme_strength_score === 'number') {
        a.strength_sum += t.theme_strength_score
        a.strength_count += 1
      }
    }
  }

  const tickers = Array.from(perTicker.values()).map((a) => {
    let event_90d = 0
    for (const tid of a.theme_ids) event_90d += evt90ByTheme.get(tid) ?? 0
    const avg_strength = a.strength_count > 0 ? a.strength_sum / a.strength_count : 0
    return {
      ticker: a.ticker,
      archetype_count: a.archetype_ids.size,
      theme_count_active: a.active_theme_ids.size,
      event_90d,
      avg_strength,
    }
  })

  const normA = buildNormalizer(tickers.map((x) => x.archetype_count))
  const normT = buildNormalizer(tickers.map((x) => x.theme_count_active))
  const normE = buildNormalizer(tickers.map((x) => x.event_90d))
  const normS = buildNormalizer(tickers.map((x) => x.avg_strength))

  const scored = tickers.map((x) => {
    const nA = normA(x.archetype_count)
    const nT = normT(x.theme_count_active)
    const nE = normE(x.event_90d)
    const nS = normS(x.avg_strength)
    const score = nA * W_ARCHETYPE + nT * W_THEME_ACTIVE + nE * W_EVENT_90D + nS * W_AVG_STRENGTH
    return { ...x, n_archetype: nA, n_theme_active: nT, n_event_90d: nE, n_strength: nS, score: Math.round(score * 100) / 100 }
  })

  let updated = 0
  for (const s of scored) {
    const { error, count } = await supabaseAdmin
      .from('theme_recommendations')
      .update({ ticker_maturity_score: s.score }, { count: 'exact' })
      .eq('ticker_symbol', s.ticker)
    if (error) throw new Error(`UPDATE ${s.ticker}: ${error.message}`)
    updated += count ?? 0
  }

  scored.sort((a, b) => b.score - a.score)
  const top_5 = scored.slice(0, 5).map((s) => ({ ticker: s.ticker, score: s.score }))
  const bottom_5 = scored.slice(-5).reverse().map((s) => ({ ticker: s.ticker, score: s.score }))

  return { scored_count: scored.length, updated_rows: updated, top_5, bottom_5 }
}
