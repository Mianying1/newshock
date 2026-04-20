import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  const { data, count, error } = await supabaseAdmin
    .from('events')
    .select('headline, source_name, event_date', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) { console.error(error); process.exit(1) }
  console.log('Total rows:', count)
  console.log('Top 3 headlines:')
  for (const row of data ?? []) {
    console.log(' -', row.headline)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
