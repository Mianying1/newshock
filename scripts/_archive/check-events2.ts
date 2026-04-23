import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // Most recent 5 events (all)
  const { data: recent } = await supabaseAdmin.from('events').select('id, event_date, trigger_theme_id, headline').order('event_date', { ascending: false }).limit(5)
  console.log('Most recent 5 events:')
  recent?.forEach(e => console.log(' ', e.event_date?.slice(0,16), e.trigger_theme_id ? 'HAS_THEME' : 'no-theme', e.headline?.slice(0,50)))

  // Most recent 5 WITH theme
  const { data: themed } = await supabaseAdmin.from('events').select('id, event_date, trigger_theme_id, headline').not('trigger_theme_id', 'is', null).order('event_date', { ascending: false }).limit(5)
  console.log('\nMost recent 5 WITH theme:')
  themed?.forEach(e => console.log(' ', e.event_date?.slice(0,16), e.headline?.slice(0,50)))
}
main().catch(console.error)
