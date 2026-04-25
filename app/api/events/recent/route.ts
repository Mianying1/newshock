import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type Mode = 'matched' | 'unmatched' | 'all'

interface EventRow {
  id: string
  headline: string
  source_name: string | null
  source_url: string | null
  event_date: string
  created_at: string
  trigger_theme_id: string | null
  level_of_impact: 'structure' | 'subtheme' | 'event_only' | null
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
  const rawMode = request.nextUrl.searchParams.get('mode')
  const mode: Mode =
    rawMode === 'unmatched' || rawMode === 'all' ? rawMode : 'matched'
  const includeNoise = request.nextUrl.searchParams.get('noise') === '1'

  // Homepage focuses on "what's happening NOW" — hide events older than 14 days.
  // DB rows preserved; UI hide only.
  const cutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString()

  let query = supabaseAdmin
    .from('events')
    .select('id, headline, source_name, source_url, event_date, created_at, trigger_theme_id, level_of_impact')
    .gte('event_date', cutoff)
    .order('event_date', { ascending: false })
    .limit(limit)

  if (mode === 'matched') query = query.not('trigger_theme_id', 'is', null)
  else if (mode === 'unmatched') query = query.is('trigger_theme_id', null)

  // Hide isolated / noise events by default; null = legacy event (keep visible)
  if (!includeNoise) query = query.or('level_of_impact.is.null,level_of_impact.neq.event_only')

  const [eventsRes, unmatchedCountRes, matchedCountRes] = await Promise.all([
    query,
    supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .is('trigger_theme_id', null),
    supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .not('trigger_theme_id', 'is', null),
  ])

  if (eventsRes.error) {
    console.error('[api/events/recent] supabase error', eventsRes.error)
    return Response.json(
      { events: [], unmatched_count: 0, matched_count: 0, limit, mode, error: eventsRes.error.message },
      { status: 500 }
    )
  }

  const rows = (eventsRes.data ?? []) as EventRow[]
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

  const hydrated = rows.map((e) => {
    const theme = e.trigger_theme_id ? themeMap.get(e.trigger_theme_id) : null
    return {
      id: e.id,
      headline: e.headline,
      source_name: e.source_name,
      source_url: e.source_url,
      event_date: e.event_date,
      level_of_impact: e.level_of_impact,
      theme_id: theme?.id ?? null,
      theme_name: theme?.name ?? null,
      theme_name_zh: theme?.name_zh ?? null,
      theme_status: theme?.status ?? null,
    }
  })

  return Response.json({
    events: hydrated,
    unmatched_count: unmatchedCountRes.count ?? 0,
    matched_count: matchedCountRes.count ?? 0,
    limit,
    mode,
  })
}
