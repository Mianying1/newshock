import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

// Probe each table by selecting 0 rows — if table exists, PostgREST returns headers
async function probe(table: string) {
  const { error } = await supabaseAdmin.from(table).select('*').limit(0)
  return error ? `MISSING (${error.message})` : 'OK'
}

async function main() {
  const tables = ['theme_archetypes', 'themes', 'theme_recommendations']
  for (const t of tables) {
    console.log(`${t}: ${await probe(t)}`)
  }

  // Check events has trigger_theme_id by selecting it explicitly
  const { error: evErr } = await supabaseAdmin
    .from('events').select('trigger_theme_id').limit(0)
  console.log(`events.trigger_theme_id: ${evErr ? 'MISSING (' + evErr.message + ')' : 'OK'}`)
}
main().catch(e => { console.error(e); process.exit(1) })
