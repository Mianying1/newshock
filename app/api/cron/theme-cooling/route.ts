import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, first_event_at')
    .in('status', ['active', 'cooling'])

  if (error) return Response.json({ error: error.message }, { status: 500 })

  let refreshed = 0
  let coolingSet = 0
  let archived = 0

  for (const theme of themes ?? []) {
    const { data: events } = await supabaseAdmin
      .from('events')
      .select('event_date')
      .eq('trigger_theme_id', theme.id)
      .not('event_date', 'is', null)
      .order('event_date', { ascending: true })

    if (!events || events.length === 0) continue

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

    // Status transitions
    if (theme.status === 'active' && daysSinceLast >= 30) {
      updates.status = 'cooling'
      coolingSet++
    } else if (theme.status === 'cooling' && daysSinceLast >= 60) {
      updates.status = 'archived'
      archived++
    }

    await supabaseAdmin.from('themes').update(updates).eq('id', theme.id)
    refreshed++
  }

  return Response.json({
    ok: true,
    refreshed,
    cooling_set: coolingSet,
    archived,
    message: `${refreshed} themes refreshed, ${coolingSet} set to cooling, ${archived} archived`,
  })
}
