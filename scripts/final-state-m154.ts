import { config } from 'dotenv'
config({ path: '.env.localc' })

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: themes } = await sb.from('themes').select('status')
  const total = themes?.length ?? 0
  const active = themes?.filter(t => t.status === 'active').length ?? 0
  const exploratory = themes?.filter(t => t.status === 'exploratory_candidate').length ?? 0
  console.log(`themes: ${total} total (${active} active, ${exploratory} exploratory)`)

  const { count: eventsLinked } = await sb.from('events').select('*', { count: 'exact', head: true }).not('trigger_theme_id', 'is', null)
  console.log(`events with theme: ${eventsLinked}`)

  const { count: tcCount } = await sb.from('ticker_candidates').select('*', { count: 'exact', head: true })
  console.log(`ticker_candidates: ${tcCount}`)
}

main().catch(e => { console.error(e); process.exit(1) })
