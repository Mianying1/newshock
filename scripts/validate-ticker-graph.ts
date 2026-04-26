import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // Overall counts
  const { count: totalRows } = await supabaseAdmin
    .from('ticker_archetype_fit')
    .select('*', { count: 'exact', head: true })

  const { data: archRows } = await supabaseAdmin
    .from('ticker_archetype_fit')
    .select('archetype_id')
  const uniqArch = new Set((archRows ?? []).map((r) => r.archetype_id)).size

  console.log(`Total fit rows: ${totalRows}`)
  console.log(`Archetypes covered: ${uniqArch}`)
  console.log('---')

  async function dumpTicker(sym: string) {
    const { data } = await supabaseAdmin
      .from('ticker_archetype_fit')
      .select('archetype_id, fit_score, exposure_label, data_source')
      .eq('ticker_symbol', sym)
      .order('fit_score', { ascending: false })

    const { data: names } = await supabaseAdmin
      .from('theme_archetypes')
      .select('id, name')
    const nameMap = new Map(((names ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))

    console.log(`\n== ${sym} · ${data?.length ?? 0} archetype ==`)
    for (const r of data ?? []) {
      const n = nameMap.get(r.archetype_id) ?? r.archetype_id
      console.log(`  ${r.fit_score.toString().padStart(4)}  ${r.exposure_label?.padEnd(10)} ${r.data_source?.padEnd(14)} ${n}`)
    }
  }

  await dumpTicker('ALB')
  await dumpTicker('LMT')
  await dumpTicker('NVDA')

  // Top distribution
  const { data: all } = await supabaseAdmin
    .from('ticker_archetype_fit')
    .select('ticker_symbol')
  const counts = new Map<string, number>()
  for (const r of (all ?? []) as { ticker_symbol: string }[]) {
    counts.set(r.ticker_symbol, (counts.get(r.ticker_symbol) ?? 0) + 1)
  }
  const top = Array.from(counts.entries())
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)

  console.log(`\n== Top tickers (≥5 archetypes) ${top.length} total ==`)
  for (const [sym, c] of top) {
    console.log(`  ${sym.padEnd(12)} ${c}`)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
