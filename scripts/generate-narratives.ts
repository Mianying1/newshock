import { config } from 'dotenv'
config({ path: '.env.local' })

const NARRATIVE_PROMPT = `You are a senior investment strategist summarizing market narratives from active themes.

Current active themes (last 2 weeks):
{THEMES_JSON}

Task: Identify 2-3 dominant "market narratives" that synthesize multiple themes into a cohesive storyline.

Rules:
1. A narrative groups 2-5 related themes with common drivers.
2. Do NOT just list themes. Synthesize the overarching causal story.
3. Avoid investment recommendations. Use observational language.
4. Prioritize narratives with:
   - Multiple active themes (2+)
   - High combined event count
   - Overlapping tickers across themes
5. Examples of good narrative titles:
   - "AI Capex Second Wave" (AI compute + optical + power themes)
   - "Geopolitical Risk Repricing" (Iran + Russia + Taiwan themes)
   - "Consumer Polarization" (luxury strength + discount stress)
6. Examples of BAD titles:
   - "Iran Crisis" (just one theme, not a narrative)
   - "Buy Energy Stocks" (recommendation)
7. Each narrative must:
   - Be observable from current news
   - Group 2+ themes logically
   - Use an English title (max 6 words)
8. If themes don't cluster into 3 narratives, return 2.

Return JSON only, no explanation:
[
  {
    "title": "...",
    "description": "1-2 sentences explaining the cohesive causal driver",
    "related_theme_ids": ["uuid1", "uuid2"],
    "rank": 1
  }
]`

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, event_count, theme_strength_score, theme_archetypes(category)')
    .eq('status', 'active')
    .gte('event_count', 2)
    .order('theme_strength_score', { ascending: false })
    .limit(25)

  if (!themes || themes.length < 3) {
    console.log('Not enough active themes for narratives.')
    return
  }

  console.log(`Analyzing ${themes.length} active themes...`)

  const prompt = NARRATIVE_PROMPT.replace(
    '{THEMES_JSON}',
    JSON.stringify(
      themes.map((t) => ({
        id: t.id,
        name: t.name,
        category: (t.theme_archetypes as { category?: string } | null)?.category ?? 'unknown',
        events: t.event_count,
        strength: t.theme_strength_score,
      })),
      null,
      2
    )
  )

  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 2000,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.error('Failed to parse narratives JSON:', text.slice(0, 200))
    return
  }

  const narratives: { title: string; description: string; related_theme_ids: string[]; rank: number }[] =
    JSON.parse(jsonMatch[0])
  console.log(`Generated ${narratives.length} narratives`)

  // Deactivate old
  await supabaseAdmin.from('market_narratives').update({ is_active: false }).eq('is_active', true)

  // Insert new
  for (const n of narratives) {
    const validIds = n.related_theme_ids.filter((id) => themes.some((t) => t.id === id))
    if (validIds.length < 2) {
      console.log(`  ⚠️  Skipping "${n.title}" — fewer than 2 valid theme IDs`)
      continue
    }

    const { data: recs } = await supabaseAdmin
      .from('theme_recommendations')
      .select('ticker_symbol, theme_id')
      .in('theme_id', validIds)

    const uniqueTickers = [...new Set((recs ?? []).map((r) => r.ticker_symbol))]

    // Chokepoints: tickers appearing in ≥2 themes
    const tickerThemes: Record<string, Set<string>> = {}
    for (const r of recs ?? []) {
      if (!tickerThemes[r.ticker_symbol]) tickerThemes[r.ticker_symbol] = new Set()
      tickerThemes[r.ticker_symbol].add(r.theme_id)
    }
    const chokepoints = Object.entries(tickerThemes)
      .filter(([, themes]) => themes.size >= 2)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5)
      .map(([symbol]) => symbol)

    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabaseAdmin.from('market_narratives').insert({
      title: n.title,
      description: n.description,
      related_theme_ids: validIds,
      aggregate_ticker_count: uniqueTickers.length,
      top_chokepoint_tickers: chokepoints,
      rank: n.rank ?? 1,
      valid_until: validUntil,
      is_active: true,
    })

    if (error) {
      console.error(`  ❌ ${n.title}:`, error.message)
    } else {
      console.log(`  ✅ "${n.title}" (${validIds.length} themes, ${uniqueTickers.length} tickers, ${chokepoints.length} chokepoints: ${chokepoints.join(', ')})`)
    }
  }

  console.log('\nDone.')
}

main().catch(console.error)
