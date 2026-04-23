import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // 1. ticker_type distribution
  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_type')
  const dist: Record<string, number> = {}
  for (const r of (recs ?? []) as Array<{ ticker_type: string | null }>) {
    const k = r.ticker_type ?? 'null'
    dist[k] = (dist[k] ?? 0) + 1
  }
  console.log('=== ticker_type distribution ===')
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${v}`)
  }

  // 2. approved candidate proposed_tickers · match against theme_recommendations on same umbrella_theme_id
  const { data: cands } = await supabaseAdmin
    .from('new_angle_candidates')
    .select('umbrella_theme_id, angle_label, proposed_tickers')
    .eq('status', 'approved')
  const approved = (cands ?? []) as Array<{ umbrella_theme_id: string; angle_label: string; proposed_tickers: string[] | null }>

  const allProposed = new Set<string>()
  for (const c of approved) for (const t of c.proposed_tickers ?? []) allProposed.add(t)
  console.log(`\napproved candidates: ${approved.length} · unique proposed tickers: ${allProposed.size}`)

  // Fetch theme_recommendations for the umbrella_theme_ids the candidates point to
  const umbIds = Array.from(new Set(approved.map((c) => c.umbrella_theme_id)))
  const { data: trs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id, ticker_symbol, ticker_type, ticker_maturity_score')
    .in('theme_id', umbIds)
  type TR = { theme_id: string; ticker_symbol: string; ticker_type: string | null; ticker_maturity_score: number | null }
  const trByKey = new Map<string, TR>()
  for (const r of (trs ?? []) as TR[]) trByKey.set(`${r.theme_id}::${r.ticker_symbol}`, r)

  console.log(`\n=== 23 approved · first 30 proposed_tickers check ===`)
  let totalPairs = 0
  let matched = 0
  const rows: Array<{ angle: string; ticker: string; type: string; score: string }> = []
  for (const c of approved) {
    for (const t of c.proposed_tickers ?? []) {
      totalPairs++
      const tr = trByKey.get(`${c.umbrella_theme_id}::${t}`)
      if (tr) {
        matched++
        rows.push({
          angle: c.angle_label.slice(0, 35),
          ticker: t,
          type: tr.ticker_type ?? 'null',
          score: tr.ticker_maturity_score?.toFixed(2) ?? '-',
        })
      } else {
        rows.push({ angle: c.angle_label.slice(0, 35), ticker: t, type: 'NOT IN REC', score: '-' })
      }
    }
  }
  for (const r of rows.slice(0, 30)) {
    console.log(`  ${r.angle.padEnd(37)} · ${r.ticker.padEnd(8)} · ${r.type.padEnd(16)} · score=${r.score}`)
  }
  console.log(`\ntotal proposed (theme,ticker) pairs: ${totalPairs}`)
  console.log(`already in theme_recommendations: ${matched} (${((matched / totalPairs) * 100).toFixed(0)}%)`)
  console.log(`NOT in theme_recommendations: ${totalPairs - matched} (${(((totalPairs - matched) / totalPairs) * 100).toFixed(0)}%)`)

  // Of matched, what types are they?
  const matchedTypeDist: Record<string, number> = {}
  for (const r of rows) {
    if (r.type === 'NOT IN REC') continue
    matchedTypeDist[r.type] = (matchedTypeDist[r.type] ?? 0) + 1
  }
  console.log('\nmatched pairs · ticker_type dist:')
  for (const [k, v] of Object.entries(matchedTypeDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${v}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
