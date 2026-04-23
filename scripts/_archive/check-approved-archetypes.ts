import { config } from 'dotenv'
config({ path: '.env.local' })
import fs from 'fs'
import path from 'path'
async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const ids = ['gcc_sovereign_wealth_tech_pivot','tungsten_supply_crisis','cell_therapy_manufacturing_automation','quantum_computing_commercialization']
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, playbook')
    .in('id', ids)
  
  const dir = path.join(process.cwd(), 'knowledge', 'playbooks')
  data?.forEach(a => {
    const pb = JSON.parse(fs.readFileSync(path.join(dir, `${a.id}.json`), 'utf-8'))
    const hasPlaybook = a.playbook && Object.keys(a.playbook).length > 2
    console.log(`${a.id}`)
    console.log(`  has_playbook: ${hasPlaybook ? 'yes' : 'no'} | duration_type: ${pb.duration_type} | maturity: ${pb.real_world_timeline?.current_maturity_estimate} | start: ${pb.real_world_timeline?.approximate_start}`)
  })
}
main().catch(console.error)
