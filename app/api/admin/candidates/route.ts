import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data: candidates, error } = await supabaseAdmin
    .from('archetype_candidates')
    .select('*')
    .order('status', { ascending: true })
    .order('scan_date', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ candidates: candidates ?? [] })
}
