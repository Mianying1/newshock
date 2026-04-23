import { config } from 'dotenv'
config({ path: '.env.local' })

// 9 archetypes with incomplete playbook (missing historical_cases/exit_signals/real_world_timeline/this_time_different)
const TARGET_IDS = [
  'fed_rate_cycle_transition',
  'global_defense_spending_super_cycle',
  'pharma_innovation_super_cycle',
  'western_critical_minerals_reshoring',
]

// Sonnet pricing (Claude Sonnet 4.x · USD per token)
const PRICE_INPUT = 3 / 1_000_000
const PRICE_OUTPUT = 15 / 1_000_000

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { callSonnetForPlaybook, splitBilingualPlaybook } = await import('../lib/archetype-pipeline')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')
  void anthropic; void MODEL_SONNET

  let totalCost = 0

  for (let i = 0; i < TARGET_IDS.length; i++) {
    const id = TARGET_IDS[i]
    const { data: arch, error } = await supabaseAdmin
      .from('theme_archetypes')
      .select('id, name, description, category, playbook, playbook_zh')
      .eq('id', id)
      .single()

    if (error || !arch) {
      console.error(`[${i + 1}/${TARGET_IDS.length}] ${id} · fetch failed: ${error?.message}`)
      process.exit(1)
    }

    const existingEn = (arch.playbook ?? {}) as Record<string, unknown>
    const existingZh = (arch.playbook_zh ?? {}) as Record<string, unknown>

    const raw = await callSonnetForPlaybook({
      id: arch.id as string,
      name: arch.name as string,
      description: (arch.description ?? null) as string | null,
      category: arch.category as string,
    })

    if (!raw) {
      console.error(`[${i + 1}/${TARGET_IDS.length}] ${arch.name} · sonnet returned null`)
      process.exit(1)
    }

    const { playbookEn: genEn, playbookZh: genZh } = splitBilingualPlaybook(raw as Record<string, unknown>)

    // Merge: preserve existing fields, add missing ones from generated
    const mergedEn: Record<string, unknown> = { ...genEn, ...existingEn }
    const mergedZh: Record<string, unknown> = { ...genZh, ...existingZh }

    // Fill in the 5 target missing fields unconditionally from generated (existing had them missing or null)
    const fillFields = [
      'historical_cases',
      'exit_signals',
      'real_world_timeline',
      'this_time_different',
      'typical_duration_label',
      'typical_duration_days_approx',
    ] as const
    for (const f of fillFields) {
      if (!(f in existingEn) || existingEn[f] == null) mergedEn[f] = genEn[f]
      if (!(f in existingZh) || existingZh[f] == null) mergedZh[f] = genZh[f]
    }

    const { error: updateErr } = await supabaseAdmin
      .from('theme_archetypes')
      .update({ playbook: mergedEn, playbook_zh: mergedZh })
      .eq('id', id)

    if (updateErr) {
      console.error(`[${i + 1}/${TARGET_IDS.length}] ${arch.name} · update failed: ${updateErr.message}`)
      process.exit(1)
    }

    // Rough cost estimate: assume ~1500 input + ~2000 output tokens per call
    const cost = 1500 * PRICE_INPUT + 2000 * PRICE_OUTPUT
    totalCost += cost

    console.log(`[${i + 1}/${TARGET_IDS.length}] ${arch.name} · cost ~$${cost.toFixed(4)} · keys_en=${Object.keys(mergedEn).length} keys_zh=${Object.keys(mergedZh).length}`)
  }

  console.log(`\nDone · total cost ~$${totalCost.toFixed(4)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
