import { config } from 'dotenv'
config({ path: '.env.local' })

type Rec = {
  id: string
  ticker_symbol: string
  theme_id: string
  ticker_maturity_score: number | null
  ticker_type: string | null
}
type Theme = {
  id: string
  name: string
  status: string
  archetype_id: string | null
  current_cycle_stage: string | null
}
type Archetype = { id: string; name: string; duration_type: string | null }

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
  const [recs, themes, archetypes] = await Promise.all([
    fetchAll<Rec>('theme_recommendations', 'id, ticker_symbol, theme_id, ticker_maturity_score, ticker_type'),
    fetchAll<Theme>('themes', 'id, name, status, archetype_id, current_cycle_stage'),
    fetchAll<Archetype>('theme_archetypes', 'id, name, duration_type'),
  ])

  const themeById = new Map<string, Theme>()
  for (const t of themes) themeById.set(t.id, t)
  const archById = new Map<string, Archetype>()
  for (const a of archetypes) archById.set(a.id, a)

  // Distribution
  const dist: Record<string, number> = { core_hold: 0, short_catalyst: 0, golden_leap: 0, null: 0 }
  for (const r of recs) dist[r.ticker_type ?? 'null']++

  console.log('=== Ticker Type Verification ===\n')
  console.log(`total recommendations: ${recs.length}`)
  console.log('\ndistribution:')
  for (const k of ['core_hold', 'short_catalyst', 'golden_leap', 'null']) {
    const pct = ((dist[k] / recs.length) * 100).toFixed(0)
    console.log(`  ${k.padEnd(15)}: ${String(dist[k]).padStart(3)} (${pct}%)`)
  }

  // Rule consistency — verify each tagged row actually satisfies rule
  const violations: string[] = []
  for (const r of recs) {
    const t = themeById.get(r.theme_id)
    const a = t?.archetype_id ? archById.get(t.archetype_id) : null
    const dt = a?.duration_type ?? null
    const stage = t?.current_cycle_stage ?? null
    const s = r.ticker_maturity_score
    const tt = r.ticker_type

    if (tt === 'core_hold') {
      if (!(s !== null && s >= 7 && stage === 'mid' && (dt === 'extended' || dt === 'dependent'))) {
        violations.push(`core_hold: ${r.ticker_symbol}@${t?.name} · score=${s} stage=${stage} dt=${dt}`)
      }
    } else if (tt === 'short_catalyst') {
      if (!(dt === 'bounded' && stage !== 'exit')) {
        violations.push(`short_catalyst: ${r.ticker_symbol}@${t?.name} · stage=${stage} dt=${dt}`)
      }
    } else if (tt === 'golden_leap') {
      if (!(s !== null && s <= 3 && stage === 'early' && (dt === 'extended' || dt === 'dependent'))) {
        violations.push(`golden_leap: ${r.ticker_symbol}@${t?.name} · score=${s} stage=${stage} dt=${dt}`)
      }
    }
  }
  console.log(`\nrule consistency: ${violations.length} violations`)
  for (const v of violations.slice(0, 10)) console.log(`  ${v}`)

  // Samples per type
  const enrich = (r: Rec) => {
    const t = themeById.get(r.theme_id)
    const a = t?.archetype_id ? archById.get(t.archetype_id) : null
    return {
      ticker: r.ticker_symbol,
      theme: t?.name ?? '?',
      archetype: a?.name ?? '?',
      stage: t?.current_cycle_stage ?? '-',
      score: r.ticker_maturity_score,
      dt: a?.duration_type ?? '-',
      type: r.ticker_type,
    }
  }

  for (const type of ['core_hold', 'short_catalyst', 'golden_leap']) {
    const rows = recs.filter((r) => r.ticker_type === type).map(enrich)
    if (rows.length === 0) continue
    console.log(`\n${type} (${rows.length}) · first 5:`)
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.ticker.padEnd(6)} score=${r.score?.toFixed(2)} stage=${r.stage.padEnd(5)} dt=${r.dt.padEnd(10)} · "${r.theme.slice(0, 55)}"`)
    }
  }

  // NULL breakdown
  const nullRecs = recs.filter((r) => r.ticker_type === null).map(enrich)
  console.log(`\nnull (${nullRecs.length}) breakdown:`)
  let nullDtMissing = 0, nullStageMissing = 0, nullScoreMissing = 0, nullExit = 0, nullNoRule = 0
  for (const r of nullRecs) {
    if (r.dt === '-' || r.dt === null) nullDtMissing++
    else if (r.dt === 'bounded' && r.stage === 'exit') nullExit++
    else if ((r.dt === 'extended' || r.dt === 'dependent') && (r.stage === '-' || r.stage === null)) nullStageMissing++
    else if ((r.dt === 'extended' || r.dt === 'dependent') && r.score === null) nullScoreMissing++
    else nullNoRule++
  }
  console.log(`  duration_type missing:          ${nullDtMissing}`)
  console.log(`  extended/dependent · no stage:  ${nullStageMissing}`)
  console.log(`  extended/dependent · no score:  ${nullScoreMissing}`)
  console.log(`  bounded + exit:                 ${nullExit}`)
  console.log(`  middle (no rule match):         ${nullNoRule}`)

  // Ticker-level type contradictions
  const tickerTypes = new Map<string, Set<string>>()
  for (const r of recs) {
    if (!r.ticker_type) continue
    let s = tickerTypes.get(r.ticker_symbol)
    if (!s) { s = new Set(); tickerTypes.set(r.ticker_symbol, s) }
    s.add(r.ticker_type)
  }
  const multiType = Array.from(tickerTypes.entries()).filter(([, s]) => s.size > 1)
  console.log(`\nticker-level cross-type (expected · different theme contexts): ${multiType.length}`)
  for (const [ticker, types] of multiType.slice(0, 10)) {
    console.log(`  ${ticker}: ${Array.from(types).join(' + ')}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
