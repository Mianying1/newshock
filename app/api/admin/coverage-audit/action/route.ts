import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

interface ActionBody {
  report_id: string
  action_type:
    | 'archetype_created'
    | 'archetype_rejected'
    | 'merger_approved'
    | 'merger_rejected'
    | 'note'
  payload?: Record<string, unknown>
  note?: string
}

export async function POST(request: NextRequest) {
  let body: ActionBody
  try {
    body = (await request.json()) as ActionBody
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.report_id || !body.action_type) {
    return Response.json({ error: 'report_id and action_type required' }, { status: 400 })
  }

  const { data: report, error: readErr } = await supabaseAdmin
    .from('coverage_audit_reports')
    .select('actions_taken, admin_notes')
    .eq('id', body.report_id)
    .maybeSingle()

  if (readErr) return Response.json({ error: readErr.message }, { status: 500 })
  if (!report) return Response.json({ error: 'report not found' }, { status: 404 })

  const existing = Array.isArray(report.actions_taken) ? report.actions_taken : []
  const nextAction = {
    type: body.action_type,
    date: new Date().toISOString(),
    payload: body.payload ?? {},
  }
  const nextActions = [...existing, nextAction]

  const update: Record<string, unknown> = {
    actions_taken: nextActions,
    admin_reviewed_at: new Date().toISOString(),
  }
  if (body.note) {
    update.admin_notes = body.note
  }

  const { error: updateErr } = await supabaseAdmin
    .from('coverage_audit_reports')
    .update(update)
    .eq('id', body.report_id)

  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })

  return Response.json({ ok: true, action: nextAction })
}
