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

type TickerType = 'core_hold' | 'short_catalyst' | 'golden_leap' | null

function classify(
  score: number | null,
  stage: string | null,
  dt: string | null
): TickerType {
  if (dt === null) return null

  if (dt === 'bounded') {
    if (stage === 'exit') return null // C4: bounded + exit → null
    return 'short_catalyst'
  }

  if (dt === 'extended' || dt === 'dependent') {
    if (stage === null) return null
    if (stage === 'exit') return null // C2
    if (score === null) return null

    if (score >= 7 && stage === 'mid') return 'core_hold' // C1: only mid
    if (score <= 3 && stage === 'early') return 'golden_leap'
    return null
  }

  return null // unknown duration_type
}

async function main() {
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

  const dist: Record<string, number> = { core_hold: 0, short_catalyst: 0, golden_leap: 0, null: 0 }
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
    if (error) {
      console.error(`UPDATE ${r.id}: ${error.message}`)
      process.exit(1)
    }
    updated++
  }

  console.log(`\ndone · ${updated} rows updated`)
  console.log('\ndistribution:')
  for (const k of ['core_hold', 'short_catalyst', 'golden_leap', 'null']) {
    const pct = ((dist[k] / recs.length) * 100).toFixed(0)
    console.log(`  ${k.padEnd(15)}: ${String(dist[k]).padStart(3)} (${pct}%)`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
