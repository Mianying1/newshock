import { config } from 'dotenv'
config({ path: '.env.localc' })

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Query 1
  const { count: processed } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .not('trigger_theme_id', 'is', null)
    .gte('created_at', '2026-04-21')
    .lt('created_at', '2026-04-22')
  console.log('=== Q1: events processed tonight ===')
  console.log(processed)

  // Query 2
  const { count: pending } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .is('trigger_theme_id', null)
  console.log('\n=== Q2: pending events remaining ===')
  console.log(pending)

  // Query 3
  const { data: themes } = await supabase
    .from('themes')
    .select('name, event_count, updated_at')
    .gte('updated_at', '2026-04-21')
    .order('event_count', { ascending: false })
    .limit(15)
  console.log('\n=== Q3: themes updated tonight ===')
  for (const t of themes ?? []) {
    console.log(`${t.event_count.toString().padStart(3)} | ${t.updated_at?.slice(0,10)} | ${t.name}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
