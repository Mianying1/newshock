import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('*')
    .limit(1)
  if (error) { console.error(error); return }
  console.log('Columns:', Object.keys(data?.[0] ?? {}))
}
main().catch(console.error)
