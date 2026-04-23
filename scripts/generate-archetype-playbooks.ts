import { config } from 'dotenv'
config({ path: '.env.local' })

import * as fs from 'node:fs'
import * as path from 'node:path'

interface Playbook {
  typical_duration_label: string
  typical_duration_days_approx: [number, number]
  historical_cases: Array<{
    name: string
    approximate_duration: string
    peak_move: string
    exit_trigger: string
    confidence: 'high' | 'medium'
  }>
  this_time_different: {
    differences: Array<{
      dimension: 'demand_side' | 'supply_side' | 'macro' | 'policy' | 'technology'
      description: string
      direction: 'may_extend' | 'may_shorten' | 'uncertain'
      confidence: 'high' | 'medium'
    }>
    similarities: Array<{
      dimension: string
      description: string
    }>
    observation: string
  }
  exit_signals: string[]
  duration_type: 'bounded' | 'extended' | 'dependent'
  duration_type_reasoning: string
  real_world_timeline: {
    approximate_start: string
    description: string
    current_maturity_estimate: 'early' | 'mid' | 'late' | 'beyond_typical'
  }
}

const PLAYBOOK_PROMPT = `You are a financial market historian and structural analyst.

For this thematic investing archetype, provide a historical playbook + "this time different" analysis.

Archetype: {name}
Description: {description}
Category: {category}

## Part 1: Historical Playbook
- typical_duration_label: Choose one from:
  'few weeks' | '1-3 months' | '3-6 months' | '6-12 months' | '12+ months'
- typical_duration_days_approx: [min_days, max_days] for calculations
- historical_cases (2-4 cases): Real historical examples of this theme type
  Each case MUST include:
  - name: Specific event name (e.g., "2022 Russia-Ukraine Oil Shock")
  - approximate_duration: Use vague language like "约 1-2 个月" or "约 3-4 周"
  - peak_move: Qualitative market move description
  - exit_trigger: What ended the theme cycle
  - confidence: 'high' (very sure) or 'medium' (likely but imprecise)

  DO NOT fabricate cases. If uncertain, include fewer cases.
  DO NOT include 'low' confidence cases.

## Part 2: "This Time Different" Analysis
Identify 2-4 structural factors in the CURRENT environment (2026) that differ from historical analogs.

Consider these dimensions:
- demand_side: New demand driver? (e.g., AI inference for chips)
- supply_side: Different supply elasticity? (e.g., HBM technical barriers)
- macro: Similar or different macro regime?
- policy: Different government intervention?
- technology: Technology paradigm shift?

For each difference, specify:
- direction: 'may_extend' | 'may_shorten' | 'uncertain'
- confidence: 'high' or 'medium'

Also list 1-3 similarities with history.

Conclude with ONE observation sentence.

## Part 3: Exit Signals
3-5 concrete signals that historically marked the end of this theme cycle.

## Rules
- Use "observed / may / approximate" language (NOT "will / predict / precisely")
- No price predictions or trade recommendations
- If uncertain about a dimension, OMIT rather than fabricate
- Focus on structural/observable factors

Return JSON only matching this schema:
{
  "typical_duration_label": "...",
  "typical_duration_days_approx": [number, number],
  "historical_cases": [...],
  "this_time_different": {
    "differences": [...],
    "similarities": [...],
    "observation": "..."
  },
  "exit_signals": [...],
  "duration_type": "bounded" | "extended" | "dependent",
  "duration_type_reasoning": "...",
  "real_world_timeline": {
    "approximate_start": "...",
    "description": "...",
    "current_maturity_estimate": "early" | "mid" | "late" | "beyond_typical"
  }
}

---

## Part 4: Duration Type Classification

Classify this archetype into ONE of 3 types:

1. 'bounded' — Clear start and end, finite typical duration.
   Examples: Iran Crisis (1-3m), FDA drug approval, M&A deal close, earnings surprise,
   single policy announcement, geopolitical flare-up.

2. 'extended' — Multi-year structural trend without clear endpoint.
   Examples: AI infrastructure capex wave, GLP-1 obesity cycle,
   energy transition, deglobalization/onshoring, semiconductor supercycle.

3. 'dependent' — Derivative theme that fades as its parent trigger fades.
   Examples: Fertilizer supply disruption (depends on geopolitical/war trigger),
   defense spending surge (depends on conflict event),
   oil equipment demand (depends on oil price cycle).

Provide:
- duration_type: one of 'bounded' | 'extended' | 'dependent'
- duration_type_reasoning: 1 sentence why

## Part 5: Real-World Timeline

Based on your training knowledge of current markets (as of Apr 2026),
estimate WHEN this theme archetype began in the real world
(NOT when any product started tracking it).

- approximate_start: e.g. '2023 Q2', '2020', 'recently emerging', 'recurring'
  Use 'recurring' for themes that repeat episodically (e.g. geopolitical flare-ups).
- description: 1 sentence describing real-world origin
- current_maturity_estimate: 'early' | 'mid' | 'late' | 'beyond_typical'
  based on real-world timeline, not product tracking days.

For genuinely new / no-analog archetypes, still provide duration_type and real_world_timeline
with best-effort estimates. Use 'recently emerging' for approximate_start if unknown.`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generatePlaybook(archetype: any, anthropic: any, model: string): Promise<Playbook | null> {
  const prompt = PLAYBOOK_PROMPT
    .replace('{name}', archetype.name)
    .replace('{description}', archetype.description || '')
    .replace('{category}', archetype.category)

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let cleaned = text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error(`  Failed to parse JSON for ${archetype.id}`)
      return null
    }
    // Sanitize: remove control characters that break JSON.parse
    const sanitized = jsonMatch[0]
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    return JSON.parse(sanitized)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`  Error for ${archetype.id}:`, msg)
    return null
  }
}

async function main() {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('@/lib/anthropic')

  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, description, category')
    .eq('is_active', true)

  if (!archetypes) return

  const outDir = path.join(process.cwd(), 'knowledge', 'playbooks')
  fs.mkdirSync(outDir, { recursive: true })

  // Filter: skip if already generated (unless --force flag)
  const force = process.argv.includes('--force')
  const archetypeArg = process.argv.find(a => a.startsWith('--archetype='))?.split('=')[1]
  const targets = archetypeArg
    ? archetypes.filter(a => a.id === archetypeArg)
    : archetypes

  console.log(`Generating playbooks for ${targets.length} archetypes (force=${force})...`)

  let succeeded = 0
  let skipped = 0
  let failed = 0

  for (const arch of targets) {
    const outPath = path.join(outDir, `${arch.id}.json`)

    if (!force && fs.existsSync(outPath)) {
      console.log(`  ⏭ ${arch.id} (already exists, use --force to regenerate)`)
      skipped++
      continue
    }

    console.log(`\nProcessing: ${arch.id}`)
    const playbook = await generatePlaybook(arch, anthropic, MODEL_SONNET)

    if (!playbook) {
      failed++
      continue
    }

    fs.writeFileSync(outPath, JSON.stringify(playbook, null, 2))
    console.log(`  ✅ Saved → knowledge/playbooks/${arch.id}.json`)
    console.log(`     ${playbook.historical_cases.length} cases · ${playbook.this_time_different?.differences?.length ?? 0} differences · "${playbook.typical_duration_label}"`)
    succeeded++

    // Rate limit
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n=== Summary ===`)
  console.log(`Succeeded: ${succeeded} | Skipped: ${skipped} | Failed: ${failed}`)
  console.log(`Output: knowledge/playbooks/ (${fs.readdirSync(outDir).length} files total)`)
}

main().catch(console.error)
