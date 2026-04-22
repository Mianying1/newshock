import { config } from 'dotenv'
config({ path: '.env.local' })

interface AuditResult {
  id: string
  name: string
  description: string
  keywords: string[]
  themes: Array<{ id: string; name: string; event_count: number }>
  breadth_verdict: 'narrow' | 'moderate' | 'broad'
  reasoning: string
  split_suggestions?: Array<{
    id: string
    name: string
    description: string
    trigger_keywords: string[]
  }>
}

const TARGET_IDS = [
  'crypto_institutional_adoption',
  'defense_buildup',
  'middle_east_energy_shock',
  'agriculture_supply_shock',
  'us_china_tariff_escalation',
  'energy_transition_acceleration',
]

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, description, trigger_keywords')
    .in('id', TARGET_IDS)

  if (!archetypes) {
    console.error('No archetypes fetched')
    return
  }

  const results: AuditResult[] = []

  for (const a of archetypes) {
    const { data: themes } = await supabaseAdmin
      .from('themes')
      .select('id, name, event_count')
      .eq('archetype_id', a.id)
      .in('status', ['active', 'cooling'])
      .order('event_count', { ascending: false })

    const themeList = (themes ?? []) as Array<{ id: string; name: string; event_count: number }>

    console.log(`\n━━ ${a.id}`)
    console.log(`   themes: ${themeList.length}, max events: ${themeList[0]?.event_count ?? 0}`)

    const prompt = `Analyze this archetype for scope breadth:

ID: ${a.id}
Name: ${a.name}
Description: ${a.description}
Trigger keywords: ${JSON.stringify(a.trigger_keywords)}

Current themes using this archetype:
${themeList.map((t) => `- ${t.name} (${t.event_count} events)`).join('\n') || '(none)'}

Question:
Does this archetype cover multiple distinct sub-topics that should be separate archetypes?

Good (narrow) archetype: single specific mechanism/entity type
  Example: 'defense_buildup' covers government defense spending
  Example: 'onshoring_industrial_policy' covers manufacturing reshoring

Bad (broad) archetype: umbrella covering multiple distinct themes
  Example: 'crypto_institutional_adoption' → ETF flows + stablecoin regulation + BTC treasury + exchange licensing + custody
  These should be 4+ separate archetypes.

If this archetype is broad, suggest how to split it:
- List 3-5 narrower sub-archetypes
- Each with: id (snake_case), name, description (1 sentence), 3-5 trigger_keywords

Return JSON only:
{
  "breadth_verdict": "narrow" | "moderate" | "broad",
  "reasoning": "1-2 sentences",
  "split_suggestions": [
    { "id": "...", "name": "...", "description": "...", "trigger_keywords": ["...", "..."] }
  ]
}

If verdict is "narrow", omit split_suggestions or return empty array.`

    try {
      const response = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.log('   ⚠️  parse failed')
        continue
      }

      const parsed = JSON.parse(jsonMatch[0])

      console.log(`   Verdict: ${parsed.breadth_verdict}`)
      console.log(`   Reason: ${parsed.reasoning}`)
      if (parsed.split_suggestions?.length) {
        console.log(`   Suggested split (${parsed.split_suggestions.length}):`)
        for (const s of parsed.split_suggestions) {
          console.log(`     - ${s.id}: ${s.name}`)
        }
      }

      results.push({
        id: a.id,
        name: a.name,
        description: a.description,
        keywords: a.trigger_keywords ?? [],
        themes: themeList,
        breadth_verdict: parsed.breadth_verdict,
        reasoning: parsed.reasoning,
        split_suggestions: parsed.split_suggestions,
      })
    } catch (err) {
      console.log(`   ⚠️  error: ${(err as Error).message}`)
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  const fs = await import('fs')
  fs.writeFileSync('data/archetype-breadth-audit.json', JSON.stringify(results, null, 2))

  console.log(`\n=== Summary ===`)
  const byVerdict = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.breadth_verdict] = (acc[r.breadth_verdict] ?? 0) + 1
    return acc
  }, {})
  console.log(`Evaluated: ${results.length}`)
  console.log(`By verdict:`, byVerdict)
  console.log(`\nSaved to data/archetype-breadth-audit.json`)
}

main().catch(console.error)
