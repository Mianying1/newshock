import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, trigger_keywords, exclusion_rules')
    .order('category')
    .order('id')

  if (error) { console.error(error); process.exit(1) }

  console.log('| id | name | category | kw_count | excl_count |')
  console.log('|---|---|---|---|---|')
  for (const r of data ?? []) {
    const kw = (r.trigger_keywords ?? []).length
    const excl = (r.exclusion_rules ?? []).length
    console.log(`| ${r.id} | ${r.name} | ${r.category} | ${kw} | ${excl} |`)
  }
  console.log(`\nTotal: ${(data ?? []).length} rows`)

  // Stats
  const all = data ?? []
  const avgKw = all.reduce((s, r) => s + (r.trigger_keywords ?? []).length, 0) / all.length
  const avgExcl = all.reduce((s, r) => s + (r.exclusion_rules ?? []).length, 0) / all.length
  console.log(`\nAvg trigger_keywords: ${avgKw.toFixed(1)}`)
  console.log(`Avg exclusion_rules: ${avgExcl.toFixed(1)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
