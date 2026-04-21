import { config } from 'dotenv'
config({ path: '.env.local' })

const VALID_DIRECTIONS = new Set(['benefits', 'headwind', 'mixed', 'uncertain'])

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  const { data: recs, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select(`
      id,
      theme_id,
      ticker_symbol,
      tier,
      role_reasoning,
      exposure_direction,
      themes!inner (name, summary)
    `)
    .eq('exposure_direction', 'uncertain')

  if (error || !recs) {
    console.error('Failed to fetch:', error?.message)
    return
  }

  console.log(`Found ${recs.length} uncertain recommendations across themes.`)

  // Group by theme
  const byTheme: Record<string, typeof recs> = {}
  for (const r of recs) {
    if (!byTheme[r.theme_id]) byTheme[r.theme_id] = []
    byTheme[r.theme_id].push(r)
  }

  console.log(`Across ${Object.keys(byTheme).length} themes.\n`)

  let totalUpdated = 0
  let themeIdx = 0

  for (const [, themeRecs] of Object.entries(byTheme)) {
    themeIdx++
    const theme = (themeRecs[0].themes as unknown as { name: string; summary: string | null })
    const themeName = theme.name
    const themeSummary = theme.summary ?? ''

    const tickerList = themeRecs
      .map((r) => `- ${r.ticker_symbol} (tier ${r.tier}): ${r.role_reasoning || 'no reasoning'}`)
      .join('\n')

    const prompt = `For the thematic investing theme below, classify each ticker's exposure direction.

Theme: ${themeName}
Summary: ${themeSummary}

Tickers:
${tickerList}

Classify exposure_direction for each ticker:
- 'benefits'  = revenue/earnings likely INCREASE from this theme
- 'headwind'  = revenue/earnings likely DECREASE from this theme
- 'mixed'     = both effects present, net unclear
- 'uncertain' = truly cannot determine

Return JSON array only, no explanation:
[{"symbol": "XXX", "direction": "benefits"|"headwind"|"mixed"|"uncertain"}, ...]`

    try {
      const response = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: 800,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = text.replace(/```json\n?|\n?```/g, '').trim().match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        console.log(`  ⚠️  [${themeIdx}] ${themeName} — parse failed`)
        continue
      }

      const results: { symbol: string; direction: string }[] = JSON.parse(jsonMatch[0])
      let themeUpdated = 0

      for (const result of results) {
        if (!VALID_DIRECTIONS.has(result.direction)) continue
        const rec = themeRecs.find((r) => r.ticker_symbol === result.symbol)
        if (!rec) continue

        const { error: upErr } = await supabaseAdmin
          .from('theme_recommendations')
          .update({ exposure_direction: result.direction })
          .eq('id', rec.id)

        if (!upErr) themeUpdated++
      }

      totalUpdated += themeUpdated
      console.log(`  ✅ [${themeIdx}] ${themeName}: ${themeUpdated}/${themeRecs.length} updated`)

      await new Promise((r) => setTimeout(r, 500))
    } catch (e: unknown) {
      console.error(`  ❌ [${themeIdx}] ${themeName}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`\n=== Done ===`)
  console.log(`Total updated: ${totalUpdated} recommendations`)
}

main().catch(console.error)
