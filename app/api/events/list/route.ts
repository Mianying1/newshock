import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type TimeRange = 'latest' | 'week' | 'older' | 'all'
type Importance = 'high' | 'medium' | 'low' | 'all'

interface EventRow {
  id: string
  headline: string
  short_headline: string | null
  short_headline_zh: string | null
  source_name: string | null
  source_url: string | null
  event_date: string
  level_of_impact: 'structure' | 'subtheme' | 'event_only' | null
  trigger_theme_id: string | null
  mentioned_tickers: string[] | null
}

interface ThemeRow {
  id: string
  name: string
  name_zh: string | null
}

const FMP_BUCKET = 'FMP Backfill'

function bucketSource(name: string | null): string {
  if (!name) return 'Unknown'
  if (name.startsWith('FMP Backfill')) return FMP_BUCKET
  return name
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams

  const sources = sp.getAll('source').filter(Boolean)
  const importance = (sp.get('importance') as Importance) || 'all'
  const themeId = sp.get('theme_id') || ''
  const timeRange = (sp.get('time_range') as TimeRange) || 'week'
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '50')))
  const offset = Math.max(0, Number(sp.get('offset') ?? '0'))

  const now = Date.now()
  const oneDayAgo = new Date(now - 86400_000).toISOString()
  const sevenDaysAgo = new Date(now - 7 * 86400_000).toISOString()

  let query = supabaseAdmin
    .from('events')
    .select(
      'id, headline, short_headline, short_headline_zh, source_name, source_url, event_date, level_of_impact, trigger_theme_id, mentioned_tickers',
      { count: 'exact' },
    )
    .order('event_date', { ascending: false })

  if (timeRange === 'latest') {
    query = query.gte('event_date', oneDayAgo)
  } else if (timeRange === 'week') {
    query = query.gte('event_date', sevenDaysAgo).lt('event_date', oneDayAgo)
  } else if (timeRange === 'older') {
    query = query.lt('event_date', sevenDaysAgo)
  }

  if (importance === 'high') query = query.eq('level_of_impact', 'structure')
  else if (importance === 'medium') query = query.eq('level_of_impact', 'subtheme')
  else if (importance === 'low') query = query.eq('level_of_impact', 'event_only')

  if (themeId) query = query.eq('trigger_theme_id', themeId)

  if (sources.length > 0) {
    const includeFmp = sources.includes(FMP_BUCKET)
    const exact = sources.filter((s) => s !== FMP_BUCKET)
    const orParts: string[] = []
    if (exact.length > 0) {
      const list = exact.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(',')
      orParts.push(`source_name.in.(${list})`)
    }
    if (includeFmp) orParts.push(`source_name.like.FMP Backfill%`)
    if (orParts.length > 0) query = query.or(orParts.join(','))
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[api/events/list] supabase error', error)
    return Response.json(
      { events: [], total: 0, has_more: false, error: error.message },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as EventRow[]

  const themeIds = Array.from(
    new Set(rows.map((r) => r.trigger_theme_id).filter((id): id is string => Boolean(id))),
  )

  const themeMap = new Map<string, ThemeRow>()
  if (themeIds.length > 0) {
    const { data: themes } = await supabaseAdmin
      .from('themes')
      .select('id, name, name_zh')
      .in('id', themeIds)
    for (const th of (themes ?? []) as ThemeRow[]) themeMap.set(th.id, th)
  }

  const events = rows.map((r) => {
    const theme = r.trigger_theme_id ? themeMap.get(r.trigger_theme_id) : null
    return {
      id: r.id,
      title: r.short_headline || r.headline,
      title_zh: r.short_headline_zh,
      headline_full: r.headline,
      source: r.source_name,
      source_bucket: bucketSource(r.source_name),
      source_url: r.source_url,
      event_date: r.event_date,
      importance: r.level_of_impact,
      theme: theme
        ? { id: theme.id, name: theme.name, name_zh: theme.name_zh }
        : null,
      tickers: r.mentioned_tickers ?? [],
    }
  })

  const total = count ?? 0
  return Response.json(
    {
      events,
      total,
      has_more: offset + events.length < total,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}
