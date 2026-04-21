import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 1. Pull existing archetype list
  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name')
    .eq('is_active', true)

  const archetypeList = archetypes?.map((a) => `- ${a.id}: ${a.name}`).join('\n') ?? ''

  const now = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  // 2. Sonnet scan prompt
  const prompt = `You are a senior market research analyst conducting a weekly scan for emerging investment themes.

Today: ${now}
Scan period: ${weekAgo} to ${now}

Newshock already tracks these archetypes:
${archetypeList}

Identify 3-5 INVESTMENT THEMES that are:
1. Receiving sustained coverage in past 7 days (not single news)
2. Have identifiable US public ticker exposure (NYSE/NASDAQ)
3. Have clear causal story with structural drivers
4. NOT already covered by the archetypes listed above
5. Market cap > $500M for core tickers

Look for emerging themes that traditional screens miss:
- Quantum computing breakthroughs
- Novel therapeutic modalities
- Commodity supply pivots
- Regulatory inflection points
- Geopolitical proxy plays
- Technology paradigm shifts (edge compute, CXL, chiplets)
- Frontier industrial (fusion, carbon capture)

For each theme provide:
{
  "title": "English theme name · subtitle",
  "proposed_archetype_id": "snake_case_id",
  "category": "ai_semi | geopolitics | supply_chain | pharma | macro_monetary | defense | energy | crypto | consumer",
  "description": "2-3 sentences explaining causal story",
  "initial_tickers": [{"symbol": "XXX", "reasoning": "1 sentence"}],
  "recent_events": ["headline 1", "headline 2", "headline 3"],
  "why_this_matters": "1 sentence rationale",
  "estimated_importance": "high | medium | low"
}

Return JSON array only.`

  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)

  if (!jsonMatch) {
    return Response.json({ error: 'failed to parse JSON response', raw: text.slice(0, 200) }, { status: 500 })
  }

  const candidates: {
    proposed_archetype_id: string
    title: string
    category: string
    description: string
    initial_tickers?: { symbol: string; reasoning?: string }[]
    recent_events?: string[]
    why_this_matters?: string
    why_this_is_a_theme?: string
    estimated_importance?: string
  }[] = JSON.parse(jsonMatch[0])

  // 3. Insert into DB, skip duplicates
  let inserted = 0
  let skipped = 0

  for (const c of candidates) {
    // Skip if archetype already exists
    const { data: existingArch } = await supabaseAdmin
      .from('theme_archetypes')
      .select('id')
      .eq('id', c.proposed_archetype_id)
      .maybeSingle()

    if (existingArch) { skipped++; continue }

    // Skip if already pending
    const { data: existingCand } = await supabaseAdmin
      .from('archetype_candidates')
      .select('id')
      .eq('proposed_archetype_id', c.proposed_archetype_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingCand) { skipped++; continue }

    const { error } = await supabaseAdmin.from('archetype_candidates').insert({
      proposed_archetype_id: c.proposed_archetype_id,
      title: c.title,
      category: c.category,
      description: c.description,
      initial_tickers: c.initial_tickers ?? [],
      recent_events: c.recent_events ?? [],
      why_this_matters: c.why_this_matters ?? c.why_this_is_a_theme ?? null,
      estimated_importance: c.estimated_importance ?? 'medium',
      scan_date: now,
      status: 'pending',
    })

    if (error) {
      console.error(`Insert failed for ${c.proposed_archetype_id}:`, error.message)
    } else {
      inserted++
    }
  }

  return Response.json({
    ok: true,
    scan_date: now,
    total_candidates: candidates.length,
    inserted,
    skipped_as_duplicate: skipped,
    message: `${inserted} new candidates ready for review at /admin/candidates`,
  })
}
