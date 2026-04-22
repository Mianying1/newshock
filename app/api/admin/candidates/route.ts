import { supabaseAdmin } from '@/lib/supabase-admin'

interface EventRow {
  id: string
  headline: string
  source_name: string | null
  source_url: string | null
  event_date: string
}

export async function GET() {
  const { data: candidates, error } = await supabaseAdmin
    .from('archetype_candidates')
    .select('*')
    .order('status', { ascending: true })
    .order('scan_date', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const rows = candidates ?? []
  const allIds = Array.from(
    new Set(
      rows.flatMap((c) =>
        Array.isArray(c.evidence_event_ids) ? (c.evidence_event_ids as string[]) : []
      )
    )
  )

  let eventsMap = new Map<string, EventRow>()
  if (allIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('events')
      .select('id, headline, source_name, source_url, event_date')
      .in('id', allIds)
    for (const e of (events ?? []) as EventRow[]) eventsMap.set(e.id, e)
  }

  const hydrated = rows.map((c) => {
    const ids: string[] = Array.isArray(c.evidence_event_ids) ? c.evidence_event_ids : []
    const evidence_events = ids
      .map((id) => eventsMap.get(id))
      .filter((e): e is EventRow => Boolean(e))
    return { ...c, evidence_events }
  })

  return Response.json({ candidates: hydrated })
}
