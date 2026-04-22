import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface EventRow {
  id: string
  headline: string
  source_name: string | null
  source_url: string | null
  event_date: string
  created_at: string
  trigger_theme_id: string | null
}

interface ThemeRow {
  id: string
  name: string
  name_zh: string | null
  status: string
}

export async function GET(request: NextRequest) {
  const limit = Math.min(
    50,
    Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '8'))
  )

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_name, source_url, event_date, created_at, trigger_theme_id')
    .order('event_date', { ascending: false })
    .limit(limit * 3)

  if (error) {
    console.error('[api/events/recent] supabase error', error)
    return Response.json({ events: [], unmatched_count: 0, limit, error: error.message }, { status: 500 })
  }

  const rows = (events ?? []) as EventRow[]
  const themeIds = Array.from(
    new Set(rows.map((e) => e.trigger_theme_id).filter((id): id is string => Boolean(id)))
  )

  const themeMap = new Map<string, ThemeRow>()
  if (themeIds.length > 0) {
    const { data: themes } = await supabaseAdmin
      .from('themes')
      .select('id, name, name_zh, status')
      .in('id', themeIds)
    for (const th of (themes ?? []) as ThemeRow[]) themeMap.set(th.id, th)
  }

  const hydrated = rows.slice(0, limit).map((e) => {
    const theme = e.trigger_theme_id ? themeMap.get(e.trigger_theme_id) : null
    return {
      id: e.id,
      headline: e.headline,
      source_name: e.source_name,
      source_url: e.source_url,
      event_date: e.event_date,
      theme_id: theme?.id ?? null,
      theme_name: theme?.name ?? null,
      theme_name_zh: theme?.name_zh ?? null,
      theme_status: theme?.status ?? null,
    }
  })

  const unmatched = rows.filter((e) => !e.trigger_theme_id).length

  return Response.json({
    events: hydrated,
    unmatched_count: unmatched,
    limit,
  })
}
