import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')
  const { data: candidates } = await supabaseAdmin
    .from('archetype_candidates')
    .select('*')
    .eq('status', 'pending')

  if (!candidates?.length) {
    console.log('No pending candidates')
    return
  }

  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, description')
    .eq('is_active', true)

  const archetypeList = archetypes?.map(a =>
    `- ${a.id} (${a.category}): ${a.name} — ${a.description}`
  ).join('\n') || ''

  for (const cand of candidates) {
    console.log(`\n━━ Analyzing: ${cand.title}`)

    const prompt = `You are a financial market research editor.
Analyze a new theme candidate for:
1. Similarity to existing archetypes (possible duplicates)
2. Theme group classification

===== NEW CANDIDATE =====
Title: ${cand.title}
Category: ${cand.category}
Description: ${cand.description}
Tickers: ${(cand.initial_tickers as { symbol: string }[])?.map((t) => t.symbol).join(', ')}

===== EXISTING ARCHETYPES =====
${archetypeList}

===== OTHER PENDING CANDIDATES =====
${candidates.filter(c => c.id !== cand.id).map(c =>
  `- ${c.proposed_archetype_id}: ${c.title}`
).join('\n')}

Return JSON:
{
  "theme_group": "AI & Semi" | "Geopolitics" | "Critical Minerals" | "Pharma/Biotech" | "Energy Transition" | "Space & Defense" | "Infrastructure" | "Financial/Macro" | "Other",

  "similarity_warnings": [
    {
      "type": "vs_existing" | "vs_candidate",
      "target_id": "archetype_id or candidate_proposed_id",
      "target_name": "readable name",
      "similarity_score": 0.0-1.0,
      "reason": "1 sentence why they overlap",
      "recommendation": "approve_as_new" | "merge_into_target" | "merge_target_into_this"
    }
  ],

  "overall_assessment": "unique" | "overlaps_existing" | "overlaps_candidate" | "should_merge"
}

Rules:
- Only flag similarity >= 0.6 (meaningful overlap)
- similarity 1.0 = near-duplicate, 0.8 = strong overlap, 0.6 = worth reviewing
- Consider: ticker overlap, causal chain similarity, time horizon, structural drivers
- DON'T flag trivial category overlap (e.g. both "energy")`

    const response = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      console.log('  ⚠️ Failed to parse response')
      continue
    }

    const analysis = JSON.parse(jsonMatch[0])

    await supabaseAdmin
      .from('archetype_candidates')
      .update({
        theme_group: analysis.theme_group,
        similarity_warnings: analysis.similarity_warnings || [],
        overall_assessment: analysis.overall_assessment ?? null,
      })
      .eq('id', cand.id)

    const warnCount = analysis.similarity_warnings?.length || 0
    console.log(`  Group: ${analysis.theme_group}`)
    console.log(`  Assessment: ${analysis.overall_assessment}`)
    if (warnCount > 0) {
      console.log(`  ⚠️ ${warnCount} similarity warning(s):`)
      for (const w of analysis.similarity_warnings) {
        console.log(`     - ${w.target_name} (${(w.similarity_score * 100).toFixed(0)}%) — ${w.reason}`)
        console.log(`       → ${w.recommendation}`)
      }
    } else {
      console.log('  ✅ No significant overlap')
    }

    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n✅ Analyzed ${candidates.length} candidates`)
  console.log('Review at: /admin/candidates')
}

main().catch(console.error)
