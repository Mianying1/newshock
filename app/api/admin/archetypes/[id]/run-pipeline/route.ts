import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runArchetypePipeline } from '@/lib/archetype-pipeline'

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const force = request.nextUrl.searchParams.get('force') === 'true'

  const { data: arch, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, pipeline_status, category, playbook')
    .eq('id', id)
    .maybeSingle()

  if (error || !arch) return Response.json({ error: 'archetype not found' }, { status: 404 })
  if (arch.pipeline_status === 'generating') {
    return Response.json({ error: 'pipeline already running' }, { status: 409 })
  }

  if (!force && arch.pipeline_status === 'ready') {
    return Response.json({
      ok: true,
      archetype_id: id,
      skipped: true,
      pipeline_status: 'ready',
      message: 'Already ready. Use ?force=true to regenerate.',
    })
  }

  // Collect tickers missing logos in the archetype's sector.
  const { data: tickerRows } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .eq('sector', arch.category ?? '')
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

  try {
    await runArchetypePipeline(id, symbols, { force })
  } catch (e) {
    console.error(`[run-pipeline] crashed for ${id}:`, e)
  }

  const { data: finalArch } = await supabaseAdmin
    .from('theme_archetypes')
    .select('pipeline_status, pipeline_error')
    .eq('id', id)
    .single()

  return Response.json({
    ok: true,
    archetype_id: id,
    pipeline_status: finalArch?.pipeline_status ?? 'unknown',
    pipeline_error: finalArch?.pipeline_error ?? null,
    ticker_symbols_queued: symbols.length,
    force,
  })
}
