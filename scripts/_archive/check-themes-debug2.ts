import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  // Same query as generate-narratives.ts
  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, category, event_count, theme_strength_score')
    .eq('status', 'active')
    .gte('event_count', 2)
    .order('theme_strength_score', { ascending: false })
    .limit(25)
  
  if (error) console.error('Query error:', error)
  console.log('themes:', themes?.length, '| error:', error?.message)
}
main().catch(console.error)
