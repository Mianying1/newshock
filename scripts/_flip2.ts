import { config } from 'dotenv'
config({ path: '.env.local' })
async function m() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  await supabaseAdmin.from('themes').update({ current_cycle_stage: 'early' }).eq('id', 'daff2614-9594-4681-ad73-4f372d5eb6f9')
  console.log('flipped back to early')
}
m()
