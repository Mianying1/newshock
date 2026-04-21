import { config } from 'dotenv'
config({ path: '.env.localc' })
async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await sb.from('theme_archetypes').select('id, playbook').neq('playbook', '{}')
  console.log(`Rows with playbook: ${data?.length}`)
  for (const r of data ?? []) {
    const cases = (r.playbook as any)?.historical_cases?.length ?? 0
    console.log(`  ${cases} cases | ${r.id}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
