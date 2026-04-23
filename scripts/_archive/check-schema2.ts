import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // Check theme_archetypes for playbook_stage
  const { data: arch } = await supabaseAdmin.from('theme_archetypes').select('*').limit(1)
  console.log('theme_archetypes columns:', Object.keys(arch?.[0] ?? {}))

  // Sample event with trigger_theme_id
  const { data: ev } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_name, source_url, event_date, trigger_theme_id')
    .not('trigger_theme_id', 'is', null)
    .limit(3)
  console.log('\nsample events with theme:', JSON.stringify(ev?.map(e => ({
    headline: e.headline?.slice(0, 60),
    source: e.source_name,
    theme: e.trigger_theme_id
  })), null, 2))
}
main().catch(console.error)
