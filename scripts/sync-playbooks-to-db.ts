import { config } from 'dotenv'
config({ path: '.env.localc' })

import * as fs from 'node:fs'
import * as path from 'node:path'

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const dir = path.join(process.cwd(), 'knowledge', 'playbooks')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  console.log(`Found ${files.length} playbook files`)

  let ok = 0, failed = 0

  for (const file of files) {
    const archetypeId = file.replace('.json', '')
    const playbook = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))

    const { error } = await sb
      .from('theme_archetypes')
      .update({ playbook })
      .eq('id', archetypeId)

    if (error) {
      console.error(`  ❌ ${archetypeId}: ${error.message}`)
      failed++
    } else {
      console.log(`  ✅ ${archetypeId} (${playbook.historical_cases?.length ?? 0} cases)`)
      ok++
    }
  }

  console.log(`\nDone: ${ok} updated, ${failed} failed`)

  // Verify
  const { data } = await sb
    .from('theme_archetypes')
    .select('id, playbook')
    .neq('playbook', '{}')
  console.log(`\nVerification: ${data?.length ?? 0} archetypes have non-empty playbook in DB`)
}

main().catch(e => { console.error(e); process.exit(1) })
