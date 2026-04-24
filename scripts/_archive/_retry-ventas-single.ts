import { config } from 'dotenv'
config({ path: '.env.local' })

/**
 * Single-event retry for bac4b159 (Ventas Inc.) which failed Sonnet JSON parse
 * during the Day 7 full SEC backfill.
 *
 * Behavior:
 * - Fetches the event row
 * - Calls generateTheme() (which routes through classify8KEvent + applyDecision)
 * - If it succeeds → library writes classification normally; we print result.
 * - If it errors again (result.action === 'error') → library already writes
 *   classifier_reasoning with an "[8-K error]" tag. We overwrite that row
 *   with a final "[8-K irrelevant · sonnet_malformed_json_after_retry]" tag
 *   so it doesn't keep showing up as pending.
 */

const EVENT_ID = 'bac4b159-e9a2-48f2-8c5c-867c57f18f48'

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { generateTheme } = await import('../../lib/theme-generator')

  const { data: ev, error } = await supabaseAdmin
    .from('events')
    .select('id, headline, raw_content, source_name, source_url, event_date, mentioned_tickers')
    .eq('id', EVENT_ID)
    .single()
  if (error || !ev) { console.error(`fetch error: ${error?.message}`); process.exit(1) }

  console.log(`retrying event: ${ev.headline}`)
  const res = await generateTheme(ev)
  console.log(`\naction: ${res.action}`)
  console.log(`reasoning: ${res.reasoning?.slice(0, 300)}`)

  if (res.action === 'error') {
    console.log('\n→ Still failed. Marking as irrelevant with post-retry tag.')
    const { error: upErr } = await supabaseAdmin
      .from('events')
      .update({
        classifier_reasoning: '[8-K irrelevant · sonnet_malformed_json_after_retry] JSON parse failure on both attempts; manually downgraded to irrelevant',
        level_of_impact: 'event_only',
      })
      .eq('id', EVENT_ID)
    if (upErr) { console.error(`update error: ${upErr.message}`); process.exit(1) }
    console.log('marked irrelevant.')
  } else {
    console.log('\n→ Succeeded this time. Library already persisted classification.')
  }

  const { data: after } = await supabaseAdmin
    .from('events')
    .select('classifier_reasoning, trigger_theme_id, level_of_impact')
    .eq('id', EVENT_ID)
    .single()
  console.log(`\nfinal state:`)
  console.log(`  classifier_reasoning: ${after?.classifier_reasoning?.slice(0, 140)}`)
  console.log(`  trigger_theme_id:     ${after?.trigger_theme_id ?? 'null'}`)
  console.log(`  level_of_impact:      ${after?.level_of_impact ?? 'null'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
