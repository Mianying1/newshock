import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin.from('themes').select('*').limit(1)
  if (data?.[0]) console.log(Object.keys(data[0]).sort().join('\n'))
}
main().catch(console.error)
