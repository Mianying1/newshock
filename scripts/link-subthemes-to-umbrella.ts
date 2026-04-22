import { supabaseAdmin } from '@/lib/supabase-admin'
import { classifySubthemeParent, type UmbrellaRef } from '@/lib/theme-tier'
import pLimit from 'p-limit'

const CONCURRENCY = 4

async function main() {
  const { data: umbrellaRows, error: umbErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary')
    .eq('theme_tier', 'umbrella')
    .in('status', ['active', 'cooling'])
    .order('name')
  if (umbErr) throw new Error(`umbrella fetch: ${umbErr.message}`)
  const umbrellas = (umbrellaRows ?? []) as UmbrellaRef[]
  console.log(`Umbrellas: ${umbrellas.length}`)
  for (const u of umbrellas) console.log(`  · ${u.name}`)

  const { data: subRows, error: subErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, parent_theme_id')
    .eq('theme_tier', 'subtheme')
    .in('status', ['active', 'cooling'])
  if (subErr) throw new Error(`subtheme fetch: ${subErr.message}`)
  const subthemes = subRows ?? []
  console.log(`\nSubthemes: ${subthemes.length}`)

  let totalCost = 0
  let noneCount = 0
  const childrenByUmbrella = new Map<string, { name: string; subname: string }[]>()
  for (const u of umbrellas) childrenByUmbrella.set(u.id, [])

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
      childrenByUmbrella.get(r.parent_id)?.push({ name: u?.name ?? '?', subname: r.sub.name })
      await supabaseAdmin
        .from('themes')
        .update({ parent_theme_id: r.parent_id })
        .eq('id', r.sub.id)
    } else {
      noneCount++
    }
  }

  console.log(`\n=== Results ===`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  console.log(`No-parent: ${noneCount}`)
  console.log(`\n--- Children per umbrella ---`)
  for (const u of umbrellas) {
    const kids = childrenByUmbrella.get(u.id) ?? []
    console.log(`\n${u.name} (${kids.length})`)
    for (const k of kids) console.log(`  · ${k.subname}`)
  }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
