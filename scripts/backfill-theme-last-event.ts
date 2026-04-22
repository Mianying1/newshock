import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, last_active_at')
    .in('status', ['active', 'cooling', 'archived'])

  if (error) { console.error(error); return }

  console.log(`Backfilling ${themes?.length ?? 0} themes...\n`)

  let updated = 0
  let skipped = 0

  for (const theme of themes ?? []) {
    const { data: events } = await supabaseAdmin
      .from('events')
      .select('event_date')
      .eq('trigger_theme_id', theme.id)
      .not('event_date', 'is', null)
      .order('event_date', { ascending: true })

    if (!events || events.length === 0) {
      skipped++
      continue
    }

    const firstEventAt = new Date(events[0].event_date)
    const lastEventAt = new Date(events[events.length - 1].event_date)

    const daysHot = Math.max(1,
      Math.floor((lastEventAt.getTime() - firstEventAt.getTime()) / 86400000) + 1
    )

    const { error: updateErr } = await supabaseAdmin
      .from('themes')
      .update({
        first_event_at: firstEventAt.toISOString(),
        last_active_at: lastEventAt.toISOString(),
        days_hot: daysHot,
      })
      .eq('id', theme.id)

    if (updateErr) {
      console.log(`  ❌ ${theme.name}: ${updateErr.message}`)
    } else {
      console.log(`  ✅ ${theme.name}: ${daysHot}d hot (${firstEventAt.toISOString().slice(0, 10)} → ${lastEventAt.toISOString().slice(0, 10)})`)
      updated++
    }

    await new Promise(r => setTimeout(r, 50))
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (no events)`)
}

main().catch(console.error)
