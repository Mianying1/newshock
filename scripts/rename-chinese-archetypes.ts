import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  // Step 1: Find non-English archetypes
  const { data: archetypes, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, description')
    .eq('is_active', true)

  if (error) { console.error(error); return }

  const chinese = (archetypes ?? []).filter(
    (a) => /[\u4e00-\u9fff]/.test(a.name) || /[\u4e00-\u9fff]/.test(a.description ?? '')
  )

  console.log(`\n📋 Found ${chinese.length} archetypes with Chinese text:\n`)
  for (const a of chinese) {
    console.log(`  ${a.id}`)
    console.log(`    name: ${a.name}`)
    console.log(`    desc: ${(a.description ?? '').slice(0, 80)}...`)
    console.log()
  }

  if (chinese.length === 0) {
    console.log('No Chinese archetypes found.')
  } else {
    console.log('━'.repeat(60))
    console.log('🤖 Translating with Sonnet...\n')

    const updates: { id: string; name: string; description: string; reasoning: string }[] = []

    for (const a of chinese) {
      const prompt = `Translate this investment theme to professional English, keeping the · subtitle format if one exists.

Name: ${a.name}
Description: ${a.description ?? ''}

Return JSON only:
{
  "suggested_name": "English Name · Subtitle",
  "suggested_description": "1-2 sentence English description of causal investment story",
  "reasoning": "1 sentence why you chose this translation"
}`

      const response = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { console.log(`  ⚠️ Parse failed for ${a.id}`); continue }

      const result = JSON.parse(jsonMatch[0])
      updates.push({ id: a.id, name: result.suggested_name, description: result.suggested_description, reasoning: result.reasoning })

      console.log(`${a.id}`)
      console.log(`  Chinese:  ${a.name}`)
      console.log(`  English:  ${result.suggested_name}`)
      console.log(`  Why:      ${result.reasoning}`)
      console.log()

      await new Promise(r => setTimeout(r, 400))
    }

    console.log('━'.repeat(60))
    console.log('📝 UPDATE SQL (review before running):\n')
    for (const u of updates) {
      const safeName = u.name.replace(/'/g, "''")
      const safeDesc = u.description.replace(/'/g, "''")
      console.log(`UPDATE theme_archetypes`)
      console.log(`SET name = '${safeName}',`)
      console.log(`    description = '${safeDesc}'`)
      console.log(`WHERE id = '${u.id}';`)
      console.log()
    }
  }

  // Step 4: Check themes table
  console.log('━'.repeat(60))
  console.log('🔍 Checking themes table for Chinese names...\n')

  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .limit(500)

  const chineseThemes = (themes ?? []).filter((t) => /[\u4e00-\u9fff]/.test(t.name ?? ''))
  console.log(`Found ${chineseThemes.length} themes with Chinese names`)
  if (chineseThemes.length > 0) {
    for (const t of chineseThemes.slice(0, 10)) {
      console.log(`  ${t.id}: ${t.name}`)
    }
    if (chineseThemes.length > 10) console.log(`  ... and ${chineseThemes.length - 10} more`)
  }
}

main().catch(console.error)
