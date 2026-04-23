import { config } from 'dotenv'
config({ path: '.env.local' })

type Cand = {
  id: string
  umbrella_theme_id: string
  angle_label: string
  angle_description: string | null
  proposed_tickers: string[] | null
  gap_reasoning: string | null
  confidence: number | null
  status: string
}
type Theme = { id: string; name: string; archetype_id: string | null }
type Arch = { id: string; duration_type: string | null }
type TR = { theme_id: string; ticker_symbol: string }
type Ticker = { symbol: string }

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: cs } = await supabaseAdmin
    .from('new_angle_candidates')
    .select('id, umbrella_theme_id, angle_label, angle_description, proposed_tickers, gap_reasoning, confidence, status')
    .eq('status', 'approved')
  const approved = (cs ?? []) as Cand[]

  // umbrella → archetype → duration_type
  const umbIds = Array.from(new Set(approved.map((c) => c.umbrella_theme_id)))
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id')
    .in('id', umbIds)
  const themeById = new Map<string, Theme>()
  for (const t of (themes ?? []) as Theme[]) themeById.set(t.id, t)
  const archIds = Array.from(new Set(((themes ?? []) as Theme[]).map((t) => t.archetype_id).filter((x): x is string => !!x)))
  const { data: archs } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, duration_type')
    .in('id', archIds)
  const archById = new Map<string, Arch>()
  for (const a of (archs ?? []) as Arch[]) archById.set(a.id, a)

  // theme_recommendations for these umbrella themes
  const { data: trs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id, ticker_symbol')
    .in('theme_id', umbIds)
  const recKeys = new Set<string>()
  for (const r of (trs ?? []) as TR[]) recKeys.add(`${r.theme_id}::${r.ticker_symbol}`)

  // All tickers · to check validity
  const allProposed = Array.from(new Set(approved.flatMap((c) => c.proposed_tickers ?? [])))
  const { data: tickerRows } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .in('symbol', allProposed)
  const validTickers = new Set<string>()
  for (const t of (tickerRows ?? []) as Ticker[]) validTickers.add(t.symbol)

  // Score each candidate: must be extended/dependent umbrella AND have tickers NOT in recs
  type Scored = Cand & {
    umbName: string
    dt: string | null
    newTickersCount: number
    validNewTickers: string[]
    invalidNewTickers: string[]
  }

  const scored: Scored[] = []
  for (const c of approved) {
    const t = themeById.get(c.umbrella_theme_id)
    const a = t?.archetype_id ? archById.get(t.archetype_id) : null
    const dt = a?.duration_type ?? null
    if (dt !== 'extended' && dt !== 'dependent') continue

    const newTickers = (c.proposed_tickers ?? []).filter((x) => !recKeys.has(`${c.umbrella_theme_id}::${x}`))
    if (newTickers.length === 0) continue

    const valid = newTickers.filter((x) => validTickers.has(x))
    const invalid = newTickers.filter((x) => !validTickers.has(x))

    scored.push({
      ...c,
      umbName: t?.name ?? '?',
      dt,
      newTickersCount: newTickers.length,
      validNewTickers: valid,
      invalidNewTickers: invalid,
    })
  }

  // Rank: confidence desc · then validNewTickers count desc
  scored.sort((a, b) => {
    const cDiff = (b.confidence ?? 0) - (a.confidence ?? 0)
    if (cDiff !== 0) return cDiff
    return b.validNewTickers.length - a.validNewTickers.length
  })

  const top5 = scored.slice(0, 5)
  console.log(`total qualifying (extended/dependent · has new tickers): ${scored.length}`)
  console.log(`showing top 5 by confidence + valid-new-ticker count:\n`)

  for (let i = 0; i < top5.length; i++) {
    const c = top5[i]
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`[${i + 1}] ${c.angle_label}`)
    console.log(`    umbrella    : ${c.umbName}  (duration_type=${c.dt})`)
    console.log(`    confidence  : ${c.confidence?.toFixed(2)}`)
    console.log(`    description : ${c.angle_description ?? '(none)'}`)
    console.log(`    gap reason  : ${c.gap_reasoning ?? '(none)'}`)
    console.log(`    proposed (${(c.proposed_tickers ?? []).length}) : ${(c.proposed_tickers ?? []).join(', ')}`)
    console.log(`    ticker validity (in tickers table):`)
    for (const t of c.proposed_tickers ?? []) {
      const inRec = recKeys.has(`${c.umbrella_theme_id}::${t}`)
      const valid = validTickers.has(t)
      const status = inRec ? 'IN_REC' : valid ? 'VALID·NEW' : 'NOT_IN_TICKERS'
      console.log(`      · ${t.padEnd(8)} ${status}`)
    }
    console.log('')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
