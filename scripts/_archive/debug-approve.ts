import { config } from 'dotenv'
config({ path: '.env.local' })
async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // 1. Get columns
  const { data } = await supabaseAdmin.from('theme_archetypes').select('*').limit(1)
  console.log('columns:', Object.keys(data?.[0] ?? {}))

  // 2. Try minimal insert
  const { data: ins, error } = await supabaseAdmin.from('theme_archetypes').insert({
    id: 'test_approve_debug',
    name: 'Test',
    category: 'geopolitics',
    description: 'Test insert',
    is_active: true
  }).select()
  console.log('\nInsert result:', JSON.stringify({ data: ins, error }, null, 2))

  // 3. Cleanup
  await supabaseAdmin.from('theme_archetypes').delete().eq('id', 'test_approve_debug')
  console.log('\nCleaned up test row.')
}
main().catch(console.error)
