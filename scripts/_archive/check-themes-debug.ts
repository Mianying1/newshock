import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, event_count, theme_strength_score')
    .eq('status', 'active')
    .order('event_count', { ascending: false })
    .limit(30)
  console.log('Active themes total:', data?.length)
  const withEvents = data?.filter((t: { event_count: number }) => t.event_count >= 2)
  console.log('With event_count >= 2:', withEvents?.length)
  data?.forEach((t: { name: string; event_count: number; theme_strength_score: number }) => 
    console.log(`  events=${t.event_count} strength=${t.theme_strength_score} | ${t.name.substring(0,50)}`)
  )
}
main().catch(console.error)
