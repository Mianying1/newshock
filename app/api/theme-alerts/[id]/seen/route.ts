import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const maxDuration = 10

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await supabaseAdmin
    .from('theme_alerts')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
