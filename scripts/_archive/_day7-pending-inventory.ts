import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // Paginate — Supabase caps each response at 1000 rows
  const data: Array<{ source_name: string | null; trigger_theme_id: string | null }> = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabaseAdmin
      .from('events')
      .select('source_name, trigger_theme_id')
      .or('source_name.ilike.%backfill%,source_name.eq.SEC EDGAR 8-K Filings')
      .range(from, from + pageSize - 1)
    if (error) { console.error(error); process.exit(1) }
    if (!page || page.length === 0) break
    data.push(...page)
    if (page.length < pageSize) break
  }
  console.log(`fetched ${data.length} rows\n`)

  const bySource: Record<string, { total: number; pending: number }> = {}
  for (const e of data ?? []) {
    const sn = (e.source_name ?? '') as string
    if (!bySource[sn]) bySource[sn] = { total: 0, pending: 0 }
    bySource[sn].total++
    if (e.trigger_theme_id == null) bySource[sn].pending++
  }

  console.log(`${'source_name'.padEnd(52)} ${'total'.padStart(6)} ${'pending'.padStart(8)}`)
  console.log('-'.repeat(70))
  let totTotal = 0, totPending = 0
  for (const [sn, c] of Object.entries(bySource).sort((a, b) => b[1].total - a[1].total)) {
    totTotal += c.total; totPending += c.pending
    console.log(`${sn.padEnd(52)} ${String(c.total).padStart(6)} ${String(c.pending).padStart(8)}`)
  }
  console.log('-'.repeat(70))
  console.log(`${'TOTAL'.padEnd(52)} ${String(totTotal).padStart(6)} ${String(totPending).padStart(8)}`)
  console.log(`\nEstimated Sonnet cost at $0.003/event: $${(totPending * 0.003).toFixed(2)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
