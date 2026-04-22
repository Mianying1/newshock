import { config } from 'dotenv'
config({ path: '.env.local' })

const NEW_IDS = [
  'crypto_etf_products',
  'stablecoin_regulation',
  'corporate_btc_treasury',
  'crypto_exchange_custody',
  'crypto_policy_framework',
  'us_china_semiconductor_controls',
  'us_china_tariff_import_costs',
  'china_critical_materials_substitution',
  'us_entity_list_technology_access',
  'us_china_technology_decoupling',
  'ai_datacenter_power_demand',
  'nuclear_renaissance_smr',
  'grid_modernization_storage',
  'clean_energy_offtake',
]

const CONCURRENCY = 3

async function main() {
  const { runArchetypePipeline } = await import('../lib/archetype-pipeline')
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const queue = [...NEW_IDS]
  const results: Array<{ id: string; status: string }> = []

  async function worker(workerIdx: number) {
    while (queue.length > 0) {
      const id = queue.shift()
      if (!id) return
      const start = Date.now()
      console.log(`[w${workerIdx}] → ${id}`)
      try {
        await runArchetypePipeline(id, [])
      } catch (e) {
        console.error(`[w${workerIdx}] ${id} threw:`, (e as Error).message)
      }
      const { data } = await supabaseAdmin
        .from('theme_archetypes')
        .select('pipeline_status, pipeline_error')
        .eq('id', id)
        .single()
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(`[w${workerIdx}] ✓ ${id} status=${data?.pipeline_status} (${elapsed}s)${data?.pipeline_error ? ' err=' + data.pipeline_error : ''}`)
      results.push({ id, status: data?.pipeline_status ?? 'unknown' })
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1))
  await Promise.all(workers)

  console.log(`\n=== Final ===`)
  const { data: finalRows } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, pipeline_status')
    .in('id', NEW_IDS)
    .order('id')
  const counts: Record<string, number> = {}
  for (const r of finalRows ?? []) {
    counts[r.pipeline_status as string] = (counts[r.pipeline_status as string] ?? 0) + 1
    console.log(`  ${r.id.padEnd(42)} ${r.pipeline_status}`)
  }
  console.log(`\nCounts:`, counts)
}

main().catch(console.error)
