import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const [activeRes, coolingRes, recsRes, lastEventRes, lastIngestRes] = await Promise.all([
    supabaseAdmin
      .from('themes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabaseAdmin
      .from('themes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'cooling'),
    supabaseAdmin
      .from('tickers')
      .select('symbol', { count: 'exact', head: true })
      .eq('is_recommendation_candidate', true),
    supabaseAdmin
      .from('events')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('events')
      .select('published_at')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const now = Date.now()
  const updatedAt = lastEventRes.data?.created_at ?? null
  const lastIngestAt = lastIngestRes.data?.published_at ?? null

  return Response.json({
    active_count: activeRes.count ?? 0,
    cooling_count: coolingRes.count ?? 0,
    rec_count: recsRes.count ?? 0,
    updated_at: updatedAt,
    updated_minutes: updatedAt
      ? Math.floor((now - new Date(updatedAt).getTime()) / 60000)
      : null,
    last_ingest_at: lastIngestAt,
    last_ingest_minutes: lastIngestAt
      ? Math.floor((now - new Date(lastIngestAt).getTime()) / 60000)
      : null,
  })
}
