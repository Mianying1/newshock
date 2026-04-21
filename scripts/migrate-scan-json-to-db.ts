import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const scansDir = path.join(process.cwd(), 'data', 'weekly-scans')
  if (!fs.existsSync(scansDir)) {
    console.log('No scans directory found, nothing to import.')
    return
  }

  const files = fs.readdirSync(scansDir).filter((f) => f.endsWith('.json'))
  console.log(`Found ${files.length} scan file(s)`)

  let total = 0
  let skipped = 0

  for (const f of files) {
    const report = JSON.parse(fs.readFileSync(path.join(scansDir, f), 'utf-8'))
    console.log(`\nImporting ${f} (${report.candidates?.length ?? 0} candidates)...`)

    for (const c of report.candidates ?? []) {
      const { error } = await supabaseAdmin.from('archetype_candidates').insert({
        proposed_archetype_id: c.proposed_archetype_id,
        title: c.title,
        category: c.category,
        description: c.description,
        initial_tickers: c.initial_tickers ?? [],
        recent_events: c.recent_events ?? [],
        why_this_matters: c.why_this_is_a_theme ?? c.why_this_matters ?? null,
        estimated_importance: c.estimated_importance ?? 'medium',
        scan_date: report.scan_date,
        status: 'pending',
      })

      if (!error) {
        console.log(`  ✅ ${c.proposed_archetype_id}`)
        total++
      } else if (error.code === '23505') {
        console.log(`  ⏭  ${c.proposed_archetype_id} (already exists)`)
        skipped++
      } else {
        console.log(`  ❌ ${c.proposed_archetype_id}: ${error.message}`)
      }
    }
  }

  console.log(`\nDone: ${total} imported, ${skipped} skipped (duplicates).`)
  console.log(`Review at: https://newshock.vercel.app/admin/candidates`)
}

main().catch(console.error)
