import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const indicator = searchParams.get('indicator')
  if (!indicator) {
    return Response.json({ error: 'indicator query param required' }, { status: 400 })
  }

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 24)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('market_regime_series')
    .select('date, value')
    .eq('indicator', indicator)
    .gte('date', cutoffStr)
    .order('date', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ indicator, points: data ?? [] })
}
