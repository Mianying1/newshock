import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // ---------- Q1: superseded_by for energy_transition_acceleration ----------
  console.log(`=== Q1: energy_transition_acceleration deprecation chain ===`)
  const { data: eta } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, deprecated, deprecated_at, deprecated_reason, superseded_by')
    .eq('id', 'energy_transition_acceleration')
    .single()
  console.log(JSON.stringify(eta, null, 2))
  if (eta?.superseded_by) {
    console.log(`\n--- replacement: ${eta.superseded_by} ---`)
    const { data: repl } = await supabaseAdmin
      .from('theme_archetypes')
      .select('id, name, category, trigger_keywords, typical_tickers, is_active, deprecated, deprecated_at')
      .eq('id', eta.superseded_by)
      .single()
    console.log(JSON.stringify(repl, null, 2))
  }

  // ---------- Q2: 3 replacement candidates for us_china_semiconductor_controls ----------
  console.log(`\n=== Q2: replacement candidates ===`)
  const candIds = ['nvda_avgo_strategic_investment', 'cpo_photonics_rotation', 'us_china_technology_decoupling']
  const { data: cands } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, trigger_keywords, typical_tickers, is_active, deprecated, deprecated_at')
    .in('id', candIds)
  for (const id of candIds) {
    const r = (cands ?? []).find((x) => x.id === id)
    if (!r) { console.log(`\n  ✗ ${id} · NOT FOUND`); continue }
    const kw = (r as { trigger_keywords?: unknown }).trigger_keywords
    const tk = (r as { typical_tickers?: unknown }).typical_tickers
    console.log(`\n  ${r.id}`)
    console.log(`    name:            ${(r as { name?: string }).name}`)
    console.log(`    category:        ${(r as { category?: string }).category}`)
    console.log(`    deprecated:      ${(r as { deprecated?: boolean }).deprecated} (${(r as { deprecated_at?: string }).deprecated_at ?? 'n/a'})`)
    console.log(`    is_active:       ${(r as { is_active?: boolean }).is_active}`)
    console.log(`    typical_tickers: ${JSON.stringify(tk)}`)
    console.log(`    trigger_keywords (${Array.isArray(kw) ? kw.length : '?'}): ${JSON.stringify(kw)}`)
  }

  // ---------- Q3: 7 n/a typical_tickers check ----------
  console.log(`\n=== Q3: raw typical_tickers for 7 n/a archetypes ===`)
  const q3ids = [
    'defense_buildup',
    'agriculture_supply_shock',
    'energy_transition_acceleration',
    'obesity_drug_breakthrough',
    'middle_east_energy_shock',
    'rare_earth_national_security',
    'turnaround_profitability_inflection',
  ]
  const { data: q3 } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_tickers, trigger_keywords')
    .in('id', q3ids)
  for (const id of q3ids) {
    const r = (q3 ?? []).find((x) => x.id === id)
    if (!r) { console.log(`  ✗ ${id} · NOT FOUND`); continue }
    const tk = (r as { typical_tickers?: unknown }).typical_tickers
    const kw = (r as { trigger_keywords?: unknown }).trigger_keywords
    const tkType = tk === null ? 'null' : Array.isArray(tk) ? `array(${tk.length})` : typeof tk
    console.log(`  ${id.padEnd(38)} · typical_tickers=${tkType} · kw=${Array.isArray(kw) ? kw.length : '?'}`)
    if (Array.isArray(tk) && tk.length > 0 && tk.length <= 20) console.log(`      → ${JSON.stringify(tk)}`)
  }

  // stop early; skip rest
  return
  const ids = [  // eslint-disable-line @typescript-eslint/no-unreachable
    'defense_buildup',
    'agriculture_supply_shock',
    'energy_transition_acceleration',
    'ai_capex_infrastructure',
    'obesity_drug_breakthrough',
    'pharma_innovation_super_cycle',
    'middle_east_energy_shock',
    'us_china_semiconductor_controls',
    'rare_earth_national_security',
    'turnaround_profitability_inflection',
  ]
  // Discover columns via a single row
  const { data: sample } = await supabaseAdmin.from('theme_archetypes').select('*').limit(1)
  console.log(`Archetype columns: ${sample?.[0] ? Object.keys(sample[0]).join(', ') : '(empty)'}\n`)

  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, trigger_keywords, typical_tickers, is_active, deprecated')
    .in('id', ids)
  if (error) throw error
  const found = new Map<string, {
    name: string | null; category: string | null;
    trigger_keywords: unknown; typical_tickers: unknown;
    is_active: boolean | null; deprecated: boolean | null;
  }>()
  for (const r of data ?? []) found.set(r.id as string, {
    name: (r as { name?: string | null }).name ?? null,
    category: (r as { category?: string | null }).category ?? null,
    trigger_keywords: (r as { trigger_keywords?: unknown }).trigger_keywords,
    typical_tickers: (r as { typical_tickers?: unknown }).typical_tickers,
    is_active: (r as { is_active?: boolean | null }).is_active ?? null,
    deprecated: (r as { deprecated?: boolean | null }).deprecated ?? null,
  })
  console.log(`Asked for ${ids.length} · found ${found.size}\n`)
  for (const id of ids) {
    const r = found.get(id)
    if (!r) { console.log(`  ✗ ${id.padEnd(40)} · NOT FOUND`); continue }
    const kw = r.trigger_keywords
    const tk = r.typical_tickers
    const kwN = Array.isArray(kw) ? kw.length : (kw ? 'n/a' : 0)
    const tkN = Array.isArray(tk) ? tk.length : (tk ? 'n/a' : 0)
    const flags = [
      r.is_active === false ? 'inactive' : null,
      r.deprecated ? 'DEPRECATED' : null,
    ].filter(Boolean).join(',')
    console.log(`  ✓ ${id.padEnd(40)} · [${r.category ?? '?'}] · ${r.name} · kw=${kwN} · tk=${tkN}${flags ? ' · ' + flags : ''}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
