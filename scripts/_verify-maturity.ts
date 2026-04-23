import { config } from 'dotenv'
config({ path: '.env.local' })

type Rec = {
  ticker_symbol: string
  theme_id: string
  ticker_maturity_score: number | null
}
type Theme = {
  id: string
  status: string
  archetype_id: string | null
  theme_strength_score: number | null
}
type Event = { trigger_theme_id: string | null; created_at: string }

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
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

async function main() {
  const [recs, themes, events] = await Promise.all([
    fetchAll<Rec>('theme_recommendations', 'ticker_symbol, theme_id, ticker_maturity_score'),
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

  // Count + coverage
  const total = recs.length
  const scored = recs.filter((r) => r.ticker_maturity_score != null).length
  const nullCnt = total - scored

  // Histogram (per-ticker, dedup)
  type TickerInfo = {
    ticker: string
    score: number | null
    archetype_ids: Set<string>
    active_theme_ids: Set<string>
    theme_ids: Set<string>
    strength_sum: number
    strength_count: number
  }
  const perTicker = new Map<string, TickerInfo>()
  for (const r of recs) {
    const t = themeById.get(r.theme_id)
    let info = perTicker.get(r.ticker_symbol)
    if (!info) {
      info = {
        ticker: r.ticker_symbol,
        score: r.ticker_maturity_score,
        archetype_ids: new Set(),
        active_theme_ids: new Set(),
        theme_ids: new Set(),
        strength_sum: 0,
        strength_count: 0,
      }
      perTicker.set(r.ticker_symbol, info)
    }
    // Every row for a ticker should have identical score (ticker-level); consistency check
    if (info.score != null && r.ticker_maturity_score != null && info.score !== r.ticker_maturity_score) {
      console.warn(`ticker ${r.ticker_symbol} has inconsistent scores: ${info.score} vs ${r.ticker_maturity_score}`)
    }
    if (!t) continue
    if (t.archetype_id) info.archetype_ids.add(t.archetype_id)
    info.theme_ids.add(t.id)
    if (t.status === 'active') {
      info.active_theme_ids.add(t.id)
      if (typeof t.theme_strength_score === 'number') {
        info.strength_sum += t.theme_strength_score
        info.strength_count += 1
      }
    }
  }

  const tickers = Array.from(perTicker.values()).map((info) => {
    let e90 = 0
    for (const tid of info.theme_ids) e90 += evt90ByTheme.get(tid) ?? 0
    return {
      ticker: info.ticker,
      score: info.score,
      archetype_count: info.archetype_ids.size,
      theme_count_active: info.active_theme_ids.size,
      event_90d: e90,
      avg_strength: info.strength_count > 0 ? info.strength_sum / info.strength_count : 0,
    }
  })

  // Histogram
  const buckets = { low_0_3: 0, mid_3_7: 0, high_7_10: 0, null_: 0 }
  for (const t of tickers) {
    if (t.score == null) buckets.null_++
    else if (t.score < 3) buckets.low_0_3++
    else if (t.score < 7) buckets.mid_3_7++
    else buckets.high_7_10++
  }

  console.log('=== Ticker Maturity Verification ===\n')
  console.log(`theme_recommendations rows: total=${total} · scored=${scored} · null=${nullCnt}`)
  console.log(`unique tickers: ${tickers.length}`)
  console.log('\nhistogram (per ticker):')
  console.log(`  low  [0, 3):  ${buckets.low_0_3}`)
  console.log(`  mid  [3, 7):  ${buckets.mid_3_7}`)
  console.log(`  high [7, 10]: ${buckets.high_7_10}`)
  console.log(`  null:         ${buckets.null_}`)

  tickers.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  console.log('\ntop 10 (ticker · score · A / T / E_90d / avg_strength):')
  for (const t of tickers.slice(0, 10)) {
    console.log(`  ${t.ticker.padEnd(6)} ${(t.score ?? 0).toFixed(2).padStart(6)}   A=${t.archetype_count}  T=${t.theme_count_active}  E=${t.event_90d}  S=${t.avg_strength.toFixed(1)}`)
  }
  console.log('\nbottom 10:')
  for (const t of tickers.slice(-10).reverse()) {
    console.log(`  ${t.ticker.padEnd(6)} ${(t.score ?? 0).toFixed(2).padStart(6)}   A=${t.archetype_count}  T=${t.theme_count_active}  E=${t.event_90d}  S=${t.avg_strength.toFixed(1)}`)
  }

  // Median / quartile
  const scoredArr = tickers.map((t) => t.score).filter((s): s is number => s != null).sort((a, b) => a - b)
  const q = (p: number) => scoredArr[Math.floor(scoredArr.length * p)]
  console.log(`\nquartiles: min=${scoredArr[0]?.toFixed(2)} · q25=${q(0.25)?.toFixed(2)} · median=${q(0.5)?.toFixed(2)} · q75=${q(0.75)?.toFixed(2)} · max=${scoredArr[scoredArr.length - 1]?.toFixed(2)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
