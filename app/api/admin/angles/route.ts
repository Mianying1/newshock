import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

type Status = 'pending' | 'approved' | 'dismissed' | 'all'

export interface AdminAngleRow {
  id: string
  umbrella_theme_id: string
  umbrella_theme_name: string
  trigger_event_id: string | null
  angle_label: string
  angle_description: string | null
  proposed_tickers: string[]
  gap_reasoning: string | null
  confidence: number | null
  status: string
  reviewed_at: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  const filterParam = (request.nextUrl.searchParams.get('status') ?? 'pending') as Status
  const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '200')
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(500, Math.floor(limitParam)) : 200

  try {
    let query = supabaseAdmin
      .from('new_angle_candidates')
      .select('id, umbrella_theme_id, trigger_event_id, angle_label, angle_description, proposed_tickers, gap_reasoning, confidence, status, reviewed_at, created_at, themes!inner(name)')
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (filterParam !== 'all') {
      query = query.eq('status', filterParam)
    }

    const { data, error } = await query
    if (error) throw error

    const rows: AdminAngleRow[] = (data ?? []).map((r) => {
      const theme = r.themes as unknown as { name: string } | { name: string }[] | null
      const themeName = Array.isArray(theme) ? theme[0]?.name ?? '' : theme?.name ?? ''
      return {
        id: r.id as string,
        umbrella_theme_id: r.umbrella_theme_id as string,
        umbrella_theme_name: themeName,
        trigger_event_id: (r.trigger_event_id as string | null) ?? null,
        angle_label: r.angle_label as string,
        angle_description: (r.angle_description as string | null) ?? null,
        proposed_tickers: (r.proposed_tickers as string[] | null) ?? [],
        gap_reasoning: (r.gap_reasoning as string | null) ?? null,
        confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
        status: r.status as string,
        reviewed_at: (r.reviewed_at as string | null) ?? null,
        created_at: r.created_at as string,
      }
    })

    // counts for tab badges
    const { data: counts } = await supabaseAdmin
      .from('new_angle_candidates')
      .select('status')

    const byStatus = { pending: 0, approved: 0, dismissed: 0, all: 0 }
    for (const r of counts ?? []) {
      byStatus.all++
      const s = (r.status as string) ?? 'pending'
      if (s === 'pending' || s === 'approved' || s === 'dismissed') {
        byStatus[s as 'pending' | 'approved' | 'dismissed']++
      }
    }

    return Response.json({
      candidates: rows,
      total: rows.length,
      counts: byStatus,
      filter: filterParam,
      limit,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
