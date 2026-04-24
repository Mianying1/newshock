import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // Total FMP backfill events
  const { count: totalFmp } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .ilike('source_name', 'FMP Backfill%')
  console.log(`Total FMP Backfill events: ${totalFmp}`)

  // Distribution by source_name
  const { data: allFmp } = await supabaseAdmin
    .from('events')
    .select('source_name')
    .ilike('source_name', 'FMP Backfill%')
  const bySource: Record<string, number> = {}
  for (const r of allFmp ?? []) {
    const sn = r.source_name as string
    bySource[sn] = (bySource[sn] ?? 0) + 1
  }
  console.log(`\nBy source_name (${Object.keys(bySource).length} unique):`)
  for (const [sn, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sn.padEnd(50)} ${String(n).padStart(4)}`)
  }

  // Sample 1 recent insert for Day 5 archetypes
  const day5Ids = [
    'defense_buildup','agriculture_supply_shock','ai_datacenter_power_demand',
    'ai_capex_infrastructure','obesity_drug_breakthrough','pharma_innovation_super_cycle',
    'middle_east_energy_shock','cpo_photonics_rotation','rare_earth_national_security',
  ]
  console.log(`\nSample inserts (1 per Day 5 archetype, newest created_at):`)
  for (const id of day5Ids) {
    const { data } = await supabaseAdmin
      .from('events')
      .select('id, event_date, headline, source_url, source_name, raw_content, mentioned_tickers, trigger_theme_id, created_at')
      .eq('source_name', `FMP Backfill · ${id}`)
      .order('created_at', { ascending: false })
      .limit(1)
    if (!data || data.length === 0) { console.log(`  ${id}: NONE`); continue }
    const e = data[0]
    console.log(`\n  [${id}]`)
    console.log(`    id              ${e.id}`)
    console.log(`    event_date      ${e.event_date}`)
    console.log(`    headline        ${(e.headline ?? '').slice(0, 90)}`)
    console.log(`    source_name     ${e.source_name}`)
    console.log(`    source_url      ${(e.source_url ?? '').slice(0, 90)}`)
    console.log(`    trigger_theme   ${e.trigger_theme_id ?? 'null'}`)
    console.log(`    tickers         ${JSON.stringify(e.mentioned_tickers)}`)
    console.log(`    raw_content     ${(e.raw_content ?? '').slice(0, 80)}...`)
    console.log(`    created_at      ${e.created_at}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
