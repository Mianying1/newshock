import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, created_at')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  return Response.json({ archetypes: data ?? [] })
}
