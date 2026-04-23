import { config } from 'dotenv'
config({ path: '.env.local' })
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const dir = path.join(process.cwd(), 'knowledge', 'playbooks')
  
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id, theme_strength_score')
    .eq('status', 'active')
    .order('theme_strength_score', { ascending: false })
    .limit(10)
  
  console.log('\nActive themes (top 10) + duration_type:')
  for (const t of themes ?? []) {
    if (!t.archetype_id) { console.log(`  [no archetype] ${t.name?.slice(0,45)}`); continue }
    const pbPath = path.join(dir, `${t.archetype_id}.json`)
    if (!fs.existsSync(pbPath)) { console.log(`  [no playbook] ${t.name?.slice(0,45)}`); continue }
    const pb = JSON.parse(fs.readFileSync(pbPath, 'utf-8'))
    console.log(`  ${pb.duration_type?.padEnd(9)} | start: ${(pb.real_world_timeline?.approximate_start ?? 'N/A').padEnd(15)} | maturity: ${pb.real_world_timeline?.current_maturity_estimate ?? 'N/A'}`)
    console.log(`    → ${t.name?.slice(0,55)}`)
  }
}
main().catch(console.error)
