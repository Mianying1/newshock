import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

async function main() {
  const { data } = await supabaseAdmin
    .from('events')
    .select('headline, raw_content, pattern_id, classification_confidence, classifier_reasoning, mentioned_tickers, novel_tickers')
    .not('classifier_reasoning', 'is', null)
    .order('created_at', { ascending: true })

  const classified = (data ?? []).filter(r => r.pattern_id !== null)
  const exploratory = (data ?? []).filter(r => r.pattern_id === null && r.classifier_reasoning && !r.classifier_reasoning.startsWith('SEC') && !r.classifier_reasoning.startsWith('[irrelevant]'))

  console.log('# Classified Events (pattern_id != null)\n')
  classified.forEach((r, i) => {
    const snippet = (r.raw_content ?? '').slice(0, 200).replace(/\n/g, ' ')
    console.log(`### Event ${i + 1}`)
    console.log(`- **Headline**: ${r.headline}`)
    console.log(`- **Snippet**: ${snippet}`)
    console.log(`- **Pattern**: ${r.pattern_id} (confidence: ${r.classification_confidence ?? 'n/a'})`)
    console.log(`- **Reasoning**: ${r.classifier_reasoning}`)
    console.log(`- **Tickers (in DB)**: [${(r.mentioned_tickers ?? []).join(', ')}]`)
    console.log(`- **Novel tickers**: [${(r.novel_tickers ?? []).join(', ')}]`)
    console.log()
  })

  console.log('\n---\n')
  console.log('# Exploratory Events (relevant but no pattern match)\n')
  exploratory.forEach((r, i) => {
    console.log(`### Exploratory ${i + 1}`)
    console.log(`- **Headline**: ${r.headline}`)
    console.log(`- **Reasoning**: ${r.classifier_reasoning}`)
    console.log()
  })
}

main().catch(e => { console.error(e); process.exit(1) })
