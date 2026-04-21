import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  // 1. Pull existing archetype list
  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, description')
    .eq('is_active', true)

  const archetypeList = archetypes?.map((a) => `- ${a.id}: ${a.name}`).join('\n') || ''

  // 2. Build prompt
  const now = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const prompt = `You are a senior market research analyst conducting a weekly scan for emerging investment themes.

Today: ${now}
Scan period: ${weekAgo} to ${now}

Newshock already tracks these archetypes:
${archetypeList}

Your task:
Identify 3-5 INVESTMENT THEMES that are:
1. Receiving sustained coverage in past 7 days (not single news)
2. Have identifiable US public ticker exposure (NYSE/NASDAQ)
3. Have clear causal story with structural drivers
4. NOT already covered by the archetypes listed above
5. Market cap > $500M for core tickers

Specifically look for emerging themes that traditional screens may miss:
- Quantum computing breakthroughs (IBM, IonQ, Rigetti, etc.)
- Novel therapeutic modalities (gene editing, RNA therapies)
- Commodity supply pivots (tungsten, rare earth elements)
- Regulatory inflection points (new SEC/FDA/FTC actions)
- Geopolitical proxy plays
- Technology paradigm shifts (edge compute, CXL, chiplets)
- Frontier industrial (fusion, carbon capture)

For each new theme, provide:
{
  "title": "English theme name with subtitle · e.g. 'Quantum Computing Commercialization · Hardware Race'",
  "proposed_archetype_id": "snake_case_id",
  "category": "AI/Semi | Geopolitics | Supply Chain | Pharma | ...",
  "description": "2-3 sentences explaining causal story",
  "initial_tickers": [
    {"symbol": "IONQ", "reasoning": "Pure-play trapped-ion quantum"},
    {"symbol": "RGTI", "reasoning": "Superconducting quantum"},
    ...
  ],
  "recent_events": [
    "Event 1: headline from past 7 days",
    "Event 2: ...",
    ...
  ],
  "why_this_is_a_theme": "1 sentence rationale",
  "estimated_importance": "high | medium | low"
}

Use your knowledge of current markets (April 2026). Be specific.
Return JSON array only.`

  console.log(`Scanning market for new themes (${weekAgo} → ${now})...`)

  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)

  if (!jsonMatch) {
    console.error('Failed to parse JSON response')
    console.error('Raw:', text.slice(0, 500))
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: any[] = JSON.parse(jsonMatch[0])

  // 3. Save report
  const report = {
    scan_date: now,
    scan_period: `${weekAgo} to ${now}`,
    candidates_count: candidates.length,
    candidates,
  }

  const outDir = path.join(process.cwd(), 'data', 'weekly-scans')
  fs.mkdirSync(outDir, { recursive: true })

  const outFile = path.join(outDir, `scan-${now}.json`)
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))

  // 4. Print summary
  console.log(`\n=== Weekly Market Scan: ${now} ===\n`)
  console.log(`Found ${candidates.length} candidate themes:\n`)

  for (const c of candidates) {
    console.log(`━━ ${c.title}`)
    console.log(`   Category: ${c.category}`)
    console.log(`   Importance: ${c.estimated_importance}`)
    console.log(`   Description: ${c.description}`)
    console.log(`   Tickers: ${c.initial_tickers?.map((t: { symbol: string }) => t.symbol).join(', ')}`)
    console.log(`   Recent events:`)
    for (const e of c.recent_events || []) {
      console.log(`     - ${e}`)
    }
    console.log()
  }

  console.log(`Full report saved to: ${outFile}`)
  console.log(`\nNext steps:`)
  console.log(`  1. Review ${outFile}`)
  console.log(`  2. Decide which candidates to promote to archetypes`)
  console.log(`  3. Insert approved archetypes into theme_archetypes table`)
  console.log(`  4. Run generate-archetype-playbooks.ts for new archetypes`)
}

main().catch(console.error)
