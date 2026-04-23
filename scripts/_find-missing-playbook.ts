import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, playbook')
    .order('name')

  if (error) { console.error(error.message); process.exit(1) }

  const required = ['historical_cases', 'exit_signals', 'real_world_timeline', 'this_time_different']
  const missing: Array<{ id: string; name: string; category: string; existing_keys: string[] }> = []

  for (const row of data ?? []) {
    const pb = (row.playbook ?? {}) as Record<string, unknown>
    const keys = Object.keys(pb)
    const has = required.every((k) => k in pb)
    if (!has) {
      missing.push({
        id: row.id as string,
        name: row.name as string,
        category: row.category as string,
        existing_keys: keys,
      })
    }
  }

  console.log(`total=${(data ?? []).length} missing=${missing.length}`)
  for (const m of missing) {
    console.log(`- ${m.name} [${m.id}] category=${m.category} existing_keys=${JSON.stringify(m.existing_keys)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
