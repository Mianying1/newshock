import { config } from 'dotenv'
config({ path: '.env.local' })

import pLimit from 'p-limit'

const CONCURRENCY = 4

const NEW_ARCHETYPE_IDS = [
  'ai_capex_infrastructure',
  'fed_rate_cycle_transition',
  'crypto_institutional_infrastructure',
  'energy_transition_capex_cycle',
  'pharma_innovation_super_cycle',
]

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { classifySubthemeParent } = await import('../lib/theme-tier')
  type UmbrellaRef = { id: string; name: string; summary: string | null }

  const { data: umbrellaRows, error: umbErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, archetype_id')
    .eq('theme_tier', 'umbrella')
    .eq('source', 'manual')
    .in('archetype_id', NEW_ARCHETYPE_IDS)
    .in('status', ['active', 'cooling'])
    .order('name')
  if (umbErr) throw new Error(`umbrella fetch: ${umbErr.message}`)
  const umbrellas = (umbrellaRows ?? []) as (UmbrellaRef & { archetype_id: string })[]
  if (umbrellas.length !== 5) {
    throw new Error(`expected 5 new umbrellas, got ${umbrellas.length}`)
  }
  console.log(`New umbrellas: ${umbrellas.length}`)
  for (const u of umbrellas) console.log(`  · ${u.name} (${u.archetype_id})`)

  const { data: subRows, error: subErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, parent_theme_id')
    .eq('theme_tier', 'subtheme')
    .is('parent_theme_id', null)
    .in('status', ['active', 'cooling'])
  if (subErr) throw new Error(`subtheme fetch: ${subErr.message}`)
  const subthemes = subRows ?? []
  console.log(`\nOrphan subthemes (parent_theme_id IS NULL): ${subthemes.length}`)

  if (subthemes.length === 0) {
    console.log('Nothing to classify.')
    return
  }

  let totalCost = 0
  let noneCount = 0
  const childrenByUmbrella = new Map<string, { umb_name: string; subname: string }[]>()
  for (const u of umbrellas) childrenByUmbrella.set(u.id, [])
  const orphans: string[] = []

  const limit = pLimit(CONCURRENCY)
  const results = await Promise.all(
    subthemes.map((s) =>
      limit(async () => {
        const { parent_id, cost_usd } = await classifySubthemeParent(
          { name: s.name, summary: s.summary },
          umbrellas
        )
        return { sub: s, parent_id, cost_usd }
      })
    )
  )

  for (const r of results) {
    totalCost += r.cost_usd
    if (r.parent_id) {
      const u = umbrellas.find((x) => x.id === r.parent_id)
      childrenByUmbrella
        .get(r.parent_id)
        ?.push({ umb_name: u?.name ?? '?', subname: r.sub.name })
      const { error: updErr } = await supabaseAdmin
        .from('themes')
        .update({ parent_theme_id: r.parent_id })
        .eq('id', r.sub.id)
        .is('parent_theme_id', null)
      if (updErr) console.error(`update failed for ${r.sub.id}: ${updErr.message}`)
    } else {
      noneCount++
      orphans.push(r.sub.name)
    }
  }

  console.log(`\n=== Results ===`)
  console.log(`Total Sonnet cost: $${totalCost.toFixed(4)}`)
  console.log(`Classified to new umbrella: ${results.length - noneCount}`)
  console.log(`Still orphan (no fit among 5 new): ${noneCount}`)

  console.log(`\n--- Children per NEW umbrella ---`)
  for (const u of umbrellas) {
    const kids = childrenByUmbrella.get(u.id) ?? []
    console.log(`\n${u.name} (+${kids.length})`)
    for (const k of kids) console.log(`  · ${k.subname}`)
  }

  if (orphans.length > 0) {
    console.log(`\n--- Still orphan subthemes ---`)
    for (const n of orphans) console.log(`  · ${n}`)
  }
}
main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
