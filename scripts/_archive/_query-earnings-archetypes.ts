import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, typical_tickers, trigger_keywords, is_active, deprecated')
    .eq('category', 'earnings')
    .eq('is_active', true)
  console.log(`earnings category archetypes (active):\n`)
  for (const r of data ?? []) {
    const tk = (r as { typical_tickers?: unknown }).typical_tickers as
      | { tier1?: string[]; tier2?: string[]; tier3?: string[]; dynamic?: boolean }
      | null
    const flat = tk ? [...(tk.tier1 ?? []), ...(tk.tier2 ?? []), ...(tk.tier3 ?? [])] : []
    const dyn = tk?.dynamic ? ' DYNAMIC' : ''
    const dep = (r as { deprecated?: boolean }).deprecated ? ' DEPRECATED' : ''
    console.log(`  ${r.id}${dep}${dyn}`)
    console.log(`    name: ${(r as { name?: string }).name}`)
    console.log(`    tickers (${flat.length}): ${JSON.stringify(flat)}`)
    const kw = (r as { trigger_keywords?: unknown }).trigger_keywords
    console.log(`    keywords (${Array.isArray(kw) ? kw.length : '?'}): ${JSON.stringify(kw)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
