/**
 * scripts/phase2-explain-exploratory.ts
 *
 * For a list of event_id prefixes (or a LIKE query on classifier_reasoning),
 * print headline + classifier_reasoning + linked theme summary.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

async function main(): Promise<void> {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const prefixes = (process.argv[2] ?? 'f5caa3cb,721a0d94,44aa260f').split(',')

  for (const p of prefixes) {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: rows } = await supabaseAdmin
      .from('events')
      .select('id, event_date, headline, raw_content, source_name, trigger_theme_id, classifier_reasoning, created_at')
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)
    const data = (rows ?? []).find((r) => (r.id as string).startsWith(p))

    if (!data) { console.log(`\n— ${p}* NOT FOUND`); continue }

    console.log(`\n━━━ ${data.id.slice(0,8)} ━━━`)
    console.log(`date     : ${data.event_date}`)
    console.log(`source   : ${data.source_name}`)
    console.log(`headline : ${data.headline}`)
    console.log(`snippet  : ${(data.raw_content ?? '').slice(0, 300)}`)
    console.log(`theme_id : ${data.trigger_theme_id ?? '(none)'}`)
    console.log(`reasoning: ${data.classifier_reasoning}`)

    if (data.trigger_theme_id) {
      const { data: t } = await supabaseAdmin
        .from('themes')
        .select('id, name, status, archetype_id, theme_strength_score, event_count, summary, last_active_at')
        .eq('id', data.trigger_theme_id)
        .single()
      if (t) {
        console.log(`  theme    : "${t.name}" status=${t.status} archetype=${t.archetype_id ?? 'exploratory'} str=${t.theme_strength_score} ev=${t.event_count}`)
        console.log(`  summary  : ${(t.summary ?? '').slice(0, 240)}`)
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
