import { config } from 'dotenv'
config({ path: '.env.local' })

import { getStockNewsMultiTicker } from '@/lib/fmp'
import { anthropic } from '@/lib/anthropic'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  const to = new Date().toISOString().split('T')[0]
  const fromDate = new Date(); fromDate.setDate(fromDate.getDate() - 90)
  const from = fromDate.toISOString().split('T')[0]
  const candidates = await getStockNewsMultiTicker(['GOOGL', 'MSFT', 'META', 'AMZN', 'ORCL'], from, to, 100)
  console.log('Total candidates:', candidates.length)
  console.log('\nFirst 15 items:')
  candidates.slice(0, 15).forEach((c, i) => {
    console.log(`[${i}] ${c.publishedDate?.split('T')[0]} | ${c.title?.slice(0, 100)}`)
  })

  const { data: archetype } = await supabaseAdmin
    .from('theme_archetypes')
    .select('name, description, trigger_keywords, exclusion_rules')
    .eq('id', 'hyperscaler_mega_capex')
    .single()

  if (!archetype) { console.log('archetype not found'); return }

  console.log('\nArchetype trigger_keywords:', (archetype.trigger_keywords as string[]).join(', '))

  const toScore = candidates.slice(0, 20)
  const prompt = `Score each news item 0-10 for this investment archetype.

ARCHETYPE: ${archetype.name}
TRIGGERS: ${(archetype.trigger_keywords as string[]).join(', ')}
EXCLUSIONS: ${((archetype.exclusion_rules as string[]) || []).join(', ')}

Return JSON array ONLY: [{"index":0,"score":5,"reason":"..."}]

NEWS:
${toScore.map((c, i) =>
    `[${i}] ${c.publishedDate?.split('T')[0]} | ${c.title}\n     ${(c.text ?? '').slice(0, 150)}`
  ).join('\n\n')}`

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = r.content[0].type === 'text' ? r.content[0].text : ''
  console.log('\nSonnet scores (first 20 items):')
  console.log(text)
}

main().catch((e) => { console.error(e); process.exit(1) })
