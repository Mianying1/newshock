import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const tables = ['events', 'themes', 'theme_recommendations', 'tickers']
  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select('*').limit(1)
    if (error) { console.log(`${table}: ERROR - ${error.message}`); continue }
    console.log(`\n${table} columns:`, Object.keys(data?.[0] ?? {}))
    if (table === 'events') console.log('  sample:', JSON.stringify(data?.[0], null, 2).slice(0, 400))
  }
}
main().catch(console.error)
