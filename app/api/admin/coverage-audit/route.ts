import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data: latest, error: latestErr } = await supabaseAdmin
    .from('coverage_audit_reports')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestErr) return Response.json({ error: latestErr.message }, { status: 500 })

  const { data: history } = await supabaseAdmin
    .from('coverage_audit_reports')
    .select('id, report_date, active_archetype_count, actions_taken')
    .order('report_date', { ascending: false })
    .limit(12)

  return Response.json({
    latest: latest ?? null,
    history: history ?? [],
  })
}
