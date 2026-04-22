import { config } from 'dotenv'
config({ path: '.env.local' })

interface ArchetypeRow {
  id: string
  name: string
  category: string | null
  description: string | null
  typical_duration_days_min: number | null
  typical_duration_days_max: number | null
  playbook: { duration_type?: string; duration_type_reasoning?: string } | null
}

interface SonnetResult {
  duration_type: 'bounded' | 'extended' | 'dependent'
  typical_duration_days_min: number
  typical_duration_days_max: number
  reasoning: string
}

interface UpdateRecord {
  id: string
  name: string
  old: {
    duration_type: string | null
    min: number | null
    max: number | null
  }
  new: SonnetResult
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  const { data: archetypes, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, description, typical_duration_days_min, typical_duration_days_max, playbook')
    .eq('is_active', true)
    .order('typical_duration_days_min', { ascending: false })

  if (error || !archetypes) {
    console.error('Failed to fetch archetypes:', error?.message)
    return
  }

  const rows = archetypes as ArchetypeRow[]
  console.log(`Evaluating ${rows.length} archetypes...\n`)

  const results: UpdateRecord[] = []

  for (const arch of rows) {
    const currentType = arch.playbook?.duration_type ?? null
    console.log(`━━ ${arch.id}`)
    console.log(`   Current: ${currentType ?? '-'} ${arch.typical_duration_days_min}-${arch.typical_duration_days_max}d`)

    const prompt = `Classify this investment theme archetype:

Name: ${arch.name}
Category: ${arch.category ?? '-'}
Description: ${arch.description ?? '-'}
Current duration: ${arch.typical_duration_days_min}-${arch.typical_duration_days_max} days

Rules:
- bounded: event-driven, specific catalyst, resolves in 3-12 months
  Examples: war/ceasefire, earnings cycle, FDA approval event,
  short-term supply disruption, M&A battle

- extended: structural industry/tech/economic cycle, 1-5+ years
  Examples: AI infrastructure buildout, energy transition,
  semiconductor onshoring, technological revolution,
  demographic shift, regulatory regime change, reshoring

- dependent: secondary wave dependent on parent event
  Examples: munitions replenishment after war,
  rebuild after disaster

Duration guidelines:
- bounded: min 90-180, max 180-365
- extended: min 365-730, max 1095-1825 (3-5 years)
- dependent: min 180-365, max 730-1095

Return JSON only:
{
  "duration_type": "bounded" | "extended" | "dependent",
  "typical_duration_days_min": number,
  "typical_duration_days_max": number,
  "reasoning": "1 sentence why"
}`

    try {
      const response = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.log('   ⚠️  parse failed')
        continue
      }

      const parsed = JSON.parse(jsonMatch[0]) as SonnetResult

      console.log(`   Suggested: ${parsed.duration_type} ${parsed.typical_duration_days_min}-${parsed.typical_duration_days_max}d`)
      console.log(`   Reason: ${parsed.reasoning}`)

      results.push({
        id: arch.id,
        name: arch.name,
        old: {
          duration_type: currentType,
          min: arch.typical_duration_days_min,
          max: arch.typical_duration_days_max,
        },
        new: parsed,
      })
    } catch (err) {
      console.log(`   ⚠️  error: ${(err as Error).message}`)
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  console.log(`\n\n=== SQL to review and run ===\n`)
  console.log(`-- duration_type lives in theme_archetypes.playbook JSONB,`)
  console.log(`-- typical_duration_days_min/max are regular columns.\n`)
  for (const r of results) {
    console.log(`-- ${r.old.duration_type ?? '-'} ${r.old.min}-${r.old.max}d → ${r.new.duration_type} ${r.new.typical_duration_days_min}-${r.new.typical_duration_days_max}d`)
    console.log(`-- ${r.name}`)
    console.log(
      `UPDATE theme_archetypes SET ` +
      `typical_duration_days_min=${r.new.typical_duration_days_min}, ` +
      `typical_duration_days_max=${r.new.typical_duration_days_max}, ` +
      `playbook=jsonb_set(jsonb_set(COALESCE(playbook,'{}'::jsonb), '{duration_type}', '"${r.new.duration_type}"'::jsonb), '{duration_type_reasoning}', to_jsonb('${r.new.reasoning.replace(/'/g, "''")}'::text)) ` +
      `WHERE id='${r.id}';\n`
    )
  }

  const byType = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.new.duration_type] = (acc[r.new.duration_type] ?? 0) + 1
    return acc
  }, {})

  console.log(`\n=== Summary ===`)
  console.log(`Total: ${results.length}`)
  console.log(`By new type:`, byType)
  const changed = results.filter(
    (r) =>
      r.old.duration_type !== r.new.duration_type ||
      r.old.min !== r.new.typical_duration_days_min ||
      r.old.max !== r.new.typical_duration_days_max
  ).length
  console.log(`Changed from current: ${changed}`)

  const fs = await import('fs')
  const path = 'data/archetype-duration-updates.json'
  fs.writeFileSync(path, JSON.stringify(results, null, 2))
  console.log(`\nSaved to ${path}`)
}

main().catch(console.error)
