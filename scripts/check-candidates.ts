import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { count, error } = await s.from('ticker_candidates').select('*', { count: 'exact', head: true })
  console.log('ticker_candidates count:', count, '| error:', error?.message ?? null)
}
main()
