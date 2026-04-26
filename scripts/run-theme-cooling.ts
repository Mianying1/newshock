import { config } from 'dotenv'
config({ path: '.env.local' })

/**
 * Local runner for theme cooling lifecycle — mirrors
 * app/api/cron/theme-cooling/route.ts exactly.
 *
 * Transitions (based on daysSinceLast):
 *   archived + <30 days → active (revived)
 *   active   + >=30     → cooling
 *   cooling  + >=60     → archived
 *
 * Always refreshes first_event_at, last_active_at, days_hot.
 */

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, first_event_at')
    .in('status', ['active', 'cooling', 'archived'])
  if (error) { console.error(error); process.exit(1) }

  let refreshed = 0
  let coolingSet = 0
  let archived = 0
  const revived: { id: string; name: string }[] = []
  const statusBefore: Record<string, number> = {}
  const statusAfter: Record<string, number> = {}

  for (const theme of themes ?? []) {
    statusBefore[theme.status] = (statusBefore[theme.status] ?? 0) + 1

    const { data: events } = await supabaseAdmin
      .from('events')
      .select('event_date')
      .eq('trigger_theme_id', theme.id)
      .not('event_date', 'is', null)
      .order('event_date', { ascending: true })
    if (!events || events.length === 0) {
      statusAfter[theme.status] = (statusAfter[theme.status] ?? 0) + 1
      continue
    }

    const firstEventAt = theme.first_event_at
      ? new Date(theme.first_event_at)
      : new Date(events[0].event_date)
    const lastEventAt = new Date(events[events.length - 1].event_date)
    const daysHot = Math.max(1,
      Math.floor((lastEventAt.getTime() - firstEventAt.getTime()) / 86400000) + 1
    )
    const daysSinceLast = Math.floor((Date.now() - lastEventAt.getTime()) / 86400000)

    const updates: Record<string, unknown> = {
      first_event_at: firstEventAt.toISOString(),
      last_active_at: lastEventAt.toISOString(),
      days_hot: daysHot,
    }

    let newStatus = theme.status
    if (theme.status === 'archived' && daysSinceLast < 30) {
      updates.status = 'active'
      newStatus = 'active'
      revived.push({ id: theme.id, name: theme.name })
    } else if (theme.status === 'active' && daysSinceLast >= 30) {
      updates.status = 'cooling'
      newStatus = 'cooling'
      coolingSet++
    } else if (theme.status === 'cooling' && daysSinceLast >= 60) {
      updates.status = 'archived'
      newStatus = 'archived'
      archived++
    }

    await supabaseAdmin.from('themes').update(updates).eq('id', theme.id)
    statusAfter[newStatus] = (statusAfter[newStatus] ?? 0) + 1
    refreshed++
  }

  console.log(`\n=== theme-cooling result ===`)
  console.log(`refreshed:    ${refreshed}`)
  console.log(`cooling set:  ${coolingSet}`)
  console.log(`archived:     ${archived}`)
  console.log(`revived:      ${revived.length}`)
  if (revived.length) {
    console.log(`revived list:`)
    for (const r of revived.slice(0, 10)) console.log(`  ${r.id.slice(0, 8)} · ${r.name}`)
  }
  console.log(`\nstatus transition (active/cooling/archived only):`)
  console.log(`  before: active=${statusBefore.active ?? 0} cooling=${statusBefore.cooling ?? 0} archived=${statusBefore.archived ?? 0}`)
  console.log(`  after:  active=${statusAfter.active ?? 0} cooling=${statusAfter.cooling ?? 0} archived=${statusAfter.archived ?? 0}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
