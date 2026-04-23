import { config } from 'dotenv'
import { pathToFileURL } from 'node:url'

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
  archetype_id: string | null
  current_cycle_stage: string | null
}

type Archetype = {
  id: string
  duration_type: string | null
}

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

type TickerType = 'core_hold' | 'short_catalyst' | 'golden_leap' | 'watch' | null

function classify(
  score: number | null,
  stage: string | null,
  dt: string | null
): TickerType {
  // no duration_type → true data missing · stay null
  if (dt === null) return null

  // bounded path
  if (dt === 'bounded') {
    if (stage === 'exit') return 'watch' // window closed · fallback to watch
    return 'short_catalyst'
  }

  // extended / dependent path
  if (dt === 'extended' || dt === 'dependent') {
    if (score !== null && score >= 7 && stage === 'mid') return 'core_hold'
    if (score !== null && score <= 3 && (stage === 'early' || stage === 'mid')) return 'golden_leap'
    return 'watch'
  }

  // unknown duration_type value · treat as data anomaly · null
  return null
}

export interface ComputeTickerTypeStats {
  updated_rows: number
  distribution: Record<string, number>
}

export async function runComputeTickerType(): Promise<ComputeTickerTypeStats> {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const [recs, themes, archetypes] = await Promise.all([
    fetchAll<Rec>('theme_recommendations', 'id, ticker_symbol, theme_id, ticker_maturity_score, ticker_type'),
    fetchAll<Theme>('themes', 'id, archetype_id, current_cycle_stage'),
    fetchAll<Archetype>('theme_archetypes', 'id, duration_type'),
  ])

  const themeById = new Map<string, Theme>()
  for (const t of themes) themeById.set(t.id, t)
  const archById = new Map<string, Archetype>()
  for (const a of archetypes) archById.set(a.id, a)

  console.log(`classifying ${recs.length} recommendations...`)

  const dist: Record<string, number> = { core_hold: 0, short_catalyst: 0, golden_leap: 0, watch: 0, null: 0 }
  let updated = 0

  for (const r of recs) {
    const t = themeById.get(r.theme_id)
    const a = t?.archetype_id ? archById.get(t.archetype_id) : null
    const tt = classify(r.ticker_maturity_score, t?.current_cycle_stage ?? null, a?.duration_type ?? null)

    dist[tt ?? 'null']++

    const { error } = await supabaseAdmin
      .from('theme_recommendations')
      .update({ ticker_type: tt })
      .eq('id', r.id)
    if (error) throw new Error(`UPDATE ${r.id}: ${error.message}`)
    updated++
  }

  console.log(`\ndone · ${updated} rows updated`)
  console.log('\ndistribution:')
  for (const k of ['core_hold', 'short_catalyst', 'golden_leap', 'watch', 'null']) {
    const pct = ((dist[k] / recs.length) * 100).toFixed(0)
    console.log(`  ${k.padEnd(15)}: ${String(dist[k]).padStart(3)} (${pct}%)`)
  }

  return { updated_rows: updated, distribution: dist }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isCli) {
  runComputeTickerType().catch((e) => { console.error(e); process.exit(1) })
}
