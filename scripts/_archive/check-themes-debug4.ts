import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category')
    .limit(2)
  if (error) { console.error(error); return }
  console.log('Archetype columns:', Object.keys(data?.[0] ?? {}))
  console.log(data)
}
main().catch(console.error)
