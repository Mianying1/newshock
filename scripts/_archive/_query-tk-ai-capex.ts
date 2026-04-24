import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_tickers, trigger_keywords')
    .in('id', ['ai_capex_infrastructure', 'pharma_innovation_super_cycle'])
  for (const r of data ?? []) {
    console.log(`\n${r.id}`)
    console.log(`  typical_tickers:   ${JSON.stringify((r as { typical_tickers?: unknown }).typical_tickers)}`)
    console.log(`  trigger_keywords:  ${JSON.stringify((r as { trigger_keywords?: unknown }).trigger_keywords)}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
