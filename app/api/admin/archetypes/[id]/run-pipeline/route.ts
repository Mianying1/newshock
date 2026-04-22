import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runArchetypePipeline } from '@/lib/archetype-pipeline'

export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: arch, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, pipeline_status')
    .eq('id', id)
    .maybeSingle()

  if (error || !arch) return Response.json({ error: 'archetype not found' }, { status: 404 })
  if (arch.pipeline_status === 'generating') {
    return Response.json({ error: 'pipeline already running' }, { status: 409 })
  }

  // Collect tickers associated with this archetype's category so logo fetch has a scope.
  // Fallback: any recommendation-candidate ticker in the archetype's sector that is missing a logo.
  const { data: cat } = await supabaseAdmin
    .from('theme_archetypes')
    .select('category')
    .eq('id', id)
    .single()

  const { data: tickerRows } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .eq('sector', cat?.category ?? '')
    .is('logo_url', null)

  const symbols = (tickerRows ?? []).map((r) => r.symbol as string)

  await supabaseAdmin
    .from('theme_archetypes')
    .update({
      pipeline_status: 'pending',
      pipeline_started_at: new Date().toISOString(),
      pipeline_completed_at: null,
      pipeline_error: null,
    })
    .eq('id', id)

  void runArchetypePipeline(id, symbols).catch((e) => {
    console.error(`[run-pipeline] crashed for ${id}:`, e)
  })

  return Response.json({
    ok: true,
    archetype_id: id,
    pipeline_status: 'pending',
    ticker_symbols_queued: symbols.length,
    message: 'Pipeline restarted in background.',
  })
}
