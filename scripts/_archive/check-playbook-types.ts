import { config } from 'dotenv'
config({ path: '.env.local' })
import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const dir = path.join(process.cwd(), 'knowledge', 'playbooks')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  
  const counts: Record<string, number> = { bounded: 0, extended: 0, dependent: 0, missing: 0 }
  const samples: { id: string; dtype: string; start: string; maturity: string }[] = []
  
  const KEY_ARCHETYPES = ['geopolitical_flare_up', 'agriculture_supply_shock', 'cpo_photonics_rotation', 'hyperscaler_mega_capex', 'obesity_drug_breakthrough', 'consumer_polarization']
  
  for (const f of files) {
    const pb = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
    const dtype = pb.duration_type ?? 'missing'
    counts[dtype] = (counts[dtype] ?? 0) + 1
    
    const id = f.replace('.json', '')
    if (KEY_ARCHETYPES.includes(id)) {
      samples.push({
        id,
        dtype: pb.duration_type ?? 'N/A',
        start: pb.real_world_timeline?.approximate_start ?? 'N/A',
        maturity: pb.real_world_timeline?.current_maturity_estimate ?? 'N/A',
      })
    }
  }
  
  console.log('\nduration_type distribution:')
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  
  console.log('\nKey sample archetypes:')
  samples.forEach(s => console.log(`  ${s.id}: ${s.dtype} | start: ${s.start} | maturity: ${s.maturity}`))
}
main().catch(console.error)
