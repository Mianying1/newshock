/**
 * scripts/merge-duplicate-themes.ts
 *
 * Phase 2 · one-shot cleanup of known duplicate themes.
 *
 * Group 1 — DeFi Security Crisis variants → merge into highest-event_count theme
 * Group 2 — Ultra-Fast Charging LFP Battery (exploratory) → merge into
 *           "EV Battery Arms Race · Ultra-Fast Charging" (active)
 *
 * Usage:
 *   npx tsx scripts/merge-duplicate-themes.ts            # dry-run (prints plan)
 *   npx tsx scripts/merge-duplicate-themes.ts --apply    # actually executes
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APPLY = process.argv.includes('--apply')

interface Theme {
  id: string
  name: string
  status: string
  event_count: number
  theme_strength_score: number
}

async function findThemes(nameLike: string[]): Promise<Theme[]> {
  const conditions = nameLike.map((p) => `name.ilike.${p}`).join(',')
  const { data, error } = await supabase
    .from('themes')
    .select('id, name, status, event_count, theme_strength_score')
    .or(conditions)

  if (error) throw new Error(error.message)
  return (data ?? []) as Theme[]
}

async function mergeGroup(label: string, themes: Theme[]): Promise<void> {
  if (themes.length < 2) {
    console.log(`\n[${label}] fewer than 2 matches found — nothing to merge.`)
    for (const t of themes) console.log(`  - ${t.name} (id=${t.id.slice(0, 8)}, events=${t.event_count})`)
    return
  }

  const sorted = [...themes].sort((a, b) => b.event_count - a.event_count)
  const canonical = sorted[0]
  const duplicates = sorted.slice(1)

  console.log(`\n[${label}] ${themes.length} themes found`)
  console.log(`  canonical: "${canonical.name}" (id=${canonical.id.slice(0, 8)}, events=${canonical.event_count}, status=${canonical.status})`)
  for (const d of duplicates) {
    console.log(`  → merge:   "${d.name}" (id=${d.id.slice(0, 8)}, events=${d.event_count}, status=${d.status})`)
  }

  if (!APPLY) return

  const duplicateIds = duplicates.map((d) => d.id)

  const { data: eventsToMove, error: eventsErr } = await supabase
    .from('events')
    .update({ trigger_theme_id: canonical.id })
    .in('trigger_theme_id', duplicateIds)
    .select('id')

  if (eventsErr) throw new Error(`events update failed: ${eventsErr.message}`)

  const movedCount = (eventsToMove ?? []).length

  const totalAddedEvents = duplicates.reduce((sum, d) => sum + (d.event_count ?? 0), 0)
  await supabase
    .from('themes')
    .update({
      event_count: canonical.event_count + totalAddedEvents,
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', canonical.id)

  const { error: supErr } = await supabase
    .from('themes')
    .update({ status: 'superseded' })
    .in('id', duplicateIds)

  if (supErr) throw new Error(`themes supersede failed: ${supErr.message}`)

  console.log(`  [APPLIED] ${movedCount} events moved, ${duplicateIds.length} themes superseded, event_count consolidated`)
}

async function main(): Promise<void> {
  console.log(`Merge duplicate themes — mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const defi = await findThemes(['%DeFi Security%', '%DeFi Protocol%'])
  await mergeGroup('Group 1 · DeFi Security Crisis', defi)

  const ultraFast = await findThemes(['%Ultra-Fast Charging%', '%Ultra-Fast Charg%', '%EV Battery Arms Race%'])
  await mergeGroup('Group 2 · Ultra-Fast Charging / EV Battery Arms Race', ultraFast)

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to execute.')
  } else {
    console.log('\nMerge complete.')
  }
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
