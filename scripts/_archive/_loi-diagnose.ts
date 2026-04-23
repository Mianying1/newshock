import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // Fetch one [irrelevant] event — per lib/theme-generator.ts:1153 this
  // SHOULD have level_of_impact='event_only' (hardcoded in same update payload
  // as classifier_reasoning). If classifier_reasoning has '[irrelevant]' prefix
  // but level_of_impact is NULL, the write was silently partial.
  const { data: irrRow, error: irrErr } = await supabaseAdmin
    .from('events')
    .select('id, classifier_reasoning, level_of_impact')
    .ilike('classifier_reasoning', '[irrelevant]%')
    .limit(1)
    .single()
  console.log('irrelevant sample:', irrRow, irrErr?.message ?? '')

  // Try writing a literal value and read it back.
  if (irrRow) {
    const { error: updErr } = await supabaseAdmin
      .from('events')
      .update({ level_of_impact: 'event_only' })
      .eq('id', irrRow.id)
    console.log('explicit update err:', updErr?.message ?? '(none)')
    const { data: after } = await supabaseAdmin
      .from('events')
      .select('id, level_of_impact')
      .eq('id', irrRow.id)
      .single()
    console.log('after update        :', after)
  }

  // Probe column visibility via information_schema (Supabase REST can't; try select)
  const { error: probeErr } = await supabaseAdmin
    .from('events')
    .select('level_of_impact')
    .limit(1)
  console.log('column visible err  :', probeErr?.message ?? '(column visible to PostgREST)')
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
