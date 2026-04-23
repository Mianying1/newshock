import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: total } = await supabaseAdmin.from('events').select('id', { count: 'exact', head: true })
  const { count: withTheme } = await supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).not('trigger_theme_id', 'is', null)
  const { data: sample } = await supabaseAdmin.from('events').select('id, headline, event_date, trigger_theme_id').not('trigger_theme_id', 'is', null).order('event_date', { ascending: false }).limit(5)

  console.log('Events with trigger_theme_id:', withTheme)
  console.log('Sample:')
  sample?.forEach(e => console.log(' ', e.event_date?.slice(0,10), e.trigger_theme_id?.slice(0,8), e.headline?.slice(0,50)))
}
main().catch(console.error)
