import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString()

  const { data } = await supabaseAdmin
    .from('events')
    .select('supports_or_contradicts, level_of_impact, trigger_theme_id, created_at, event_date')
    .gte('event_date', since)
    .not('trigger_theme_id', 'is', null)
    .limit(10000)
  const rows = data ?? []
  console.log(`total recent classified events: ${rows.length}`)

  const sup: Record<string, number> = {}
  const loi: Record<string, number> = {}
  const byBoth: Record<string, number> = {}
  for (const r of rows as Array<{ supports_or_contradicts: string | null; level_of_impact: string | null }>) {
    const s = r.supports_or_contradicts ?? 'null'
    const l = r.level_of_impact ?? 'null'
    sup[s] = (sup[s] ?? 0) + 1
    loi[l] = (loi[l] ?? 0) + 1
    byBoth[`${s}|${l}`] = (byBoth[`${s}|${l}`] ?? 0) + 1
  }
  console.log('\nsupports_or_contradicts:')
  for (const [k, v] of Object.entries(sup).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${v}`)
  console.log('\nlevel_of_impact:')
  for (const [k, v] of Object.entries(loi).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${v}`)
  console.log('\ncombinations (top 10):')
  for (const [k, v] of Object.entries(byBoth).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${k.padEnd(35)} ${v}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
