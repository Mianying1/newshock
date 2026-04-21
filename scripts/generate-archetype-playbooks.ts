import { config } from 'dotenv'
config({ path: '.env.localc' })

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
  "exit_signals": [...]
}

If this archetype has no clear historical analogs (e.g., genuinely new phenomena), return:
{
  "typical_duration_label": "unknown",
  "typical_duration_days_approx": [0, 0],
  "historical_cases": [],
  "this_time_different": {...},
  "exit_signals": [...]
}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generatePlaybook(archetype: any, anthropic: any): Promise<Playbook | null> {
  const prompt = PLAYBOOK_PROMPT
    .replace('{name}', archetype.name)
    .replace('{description}', archetype.description || '')
    .replace('{category}', archetype.category)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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
  const { anthropic } = await import('@/lib/anthropic')

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
    const playbook = await generatePlaybook(arch, anthropic)

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
