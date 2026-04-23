import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export interface ThemeAlertRow {
  id: string
  theme_id: string
  theme_name: string
  alert_type: string
  from_stage: string | null
  to_stage: string
  reason: string | null
  ratio: number | null
  days_since_first_event: number | null
  severity: 'info' | 'warn' | 'critical'
  seen_at: string | null
  created_at: string
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warn: 1, info: 2 }

export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get('days') ?? '7')
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(30, Math.floor(daysParam)) : 7
  const since = new Date(Date.now() - days * 86400000).toISOString()

  try {
    const { data, error } = await supabaseAdmin
      .from('theme_alerts')
      .select('id, theme_id, alert_type, from_stage, to_stage, reason, ratio, days_since_first_event, severity, seen_at, created_at, themes!inner(name)')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    const rows: ThemeAlertRow[] = (data ?? []).map((r) => {
      const theme = r.themes as unknown as { name: string } | { name: string }[] | null
      const themeName = Array.isArray(theme) ? theme[0]?.name ?? '' : theme?.name ?? ''
      return {
        id: r.id as string,
        theme_id: r.theme_id as string,
        theme_name: themeName,
        alert_type: r.alert_type as string,
        from_stage: (r.from_stage as string | null) ?? null,
        to_stage: r.to_stage as string,
        reason: (r.reason as string | null) ?? null,
        ratio: r.ratio === null || r.ratio === undefined ? null : Number(r.ratio),
        days_since_first_event: (r.days_since_first_event as number | null) ?? null,
        severity: (r.severity as 'info' | 'warn' | 'critical') ?? 'info',
        seen_at: (r.seen_at as string | null) ?? null,
        created_at: r.created_at as string,
      }
    })

    rows.sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (s !== 0) return s
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return Response.json({
      alerts: rows,
      total: rows.length,
      unseen: rows.filter((a) => a.seen_at === null).length,
      days,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
