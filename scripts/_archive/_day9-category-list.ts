import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, category')
  const by: Record<string, string[]> = {}
  for (const r of data ?? []) {
    const k = r.category ?? 'null'
    if (!by[k]) by[k] = []
    by[k].push(r.id)
  }
  const sorted = Object.entries(by).sort((a, b) => b[1].length - a[1].length)
  console.log(`=== categories (n=${sorted.length}) ===`)
  for (const [cat, ids] of sorted) {
    console.log(`\n${cat} (${ids.length}):`)
    for (const id of ids.sort()) console.log(`  ${id}`)
  }
}
main().catch(console.error)
