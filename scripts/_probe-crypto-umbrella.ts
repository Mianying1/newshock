import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data: u } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, archetype_id')
    .eq('name', 'Crypto Institutional Infrastructure')
    .single()
  console.log('umbrella:', u)
  const { data: subs } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('parent_theme_id', u!.id)
  console.log(`subthemes (${subs?.length}):`)
  for (const s of subs ?? []) console.log(`  - ${s.name}`)
  if (u!.archetype_id) {
    const { data: a } = await supabaseAdmin
      .from('theme_archetypes')
      .select('playbook')
      .eq('id', u!.archetype_id)
      .single()
    const pb = a?.playbook as Record<string, unknown> | null
    console.log('archetype keys:', pb ? Object.keys(pb) : 'null')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
