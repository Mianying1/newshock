import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runArchetypePipeline } from '@/lib/archetype-pipeline'

export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: cand, error: fetchErr } = await supabaseAdmin
    .from('archetype_candidates')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !cand) return Response.json({ error: 'not found' }, { status: 404 })
  if (cand.status !== 'pending') {
    return Response.json({ error: `already ${cand.status}` }, { status: 400 })
  }

  // Check if archetype already exists
  const { data: existingArch } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id')
    .eq('id', cand.proposed_archetype_id)
    .maybeSingle()

  if (existingArch) {
    await supabaseAdmin
      .from('archetype_candidates')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    return Response.json({
      ok: true,
      note: 'archetype already exists, candidate marked approved',
      archetype_id: cand.proposed_archetype_id,
    })
  }

  // Create archetype — trigger_keywords is NOT NULL, seed with empty array
  const nameFirstPart = (cand.title as string).split(' · ')[0] || cand.title
  const { error: archErr } = await supabaseAdmin.from('theme_archetypes').insert({
    id: cand.proposed_archetype_id,
    name: nameFirstPart,
    category: cand.category,
    description: cand.description,
    is_active: true,
    trigger_keywords: [],
    typical_duration_days_min: 90,
    typical_duration_days_max: 180,
    confidence_level: 'medium',
    created_by: 'admin_approve',
    pipeline_status: 'pending',
    pipeline_started_at: new Date().toISOString(),
  })

  if (archErr) {
    return Response.json(
      { error: 'archetype creation failed', detail: archErr.message },
      { status: 500 }
    )
  }

  // Add missing tickers
  const tickers = (cand.initial_tickers as { symbol: string; reasoning?: string }[]) ?? []
  const allSymbols = tickers.map((t) => t.symbol)
  let newTickerCount = 0

  for (const t of tickers) {
    const { data: existing } = await supabaseAdmin
      .from('tickers')
      .select('symbol')
      .eq('symbol', t.symbol)
      .maybeSingle()

    if (!existing) {
      const { error: tickErr } = await supabaseAdmin.from('tickers').insert({
        symbol: t.symbol,
        company_name: t.symbol,
        sector: cand.category,
        is_recommendation_candidate: true,
      })
      if (!tickErr) newTickerCount++
    }
  }

  // Mark approved
  await supabaseAdmin
    .from('archetype_candidates')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id)

  // Await pipeline inline — void Promises are killed on Vercel serverless after response.
  // maxDuration=60 covers playbook (~20s) + logos (5 tickers * 0.2s).
  try {
    await runArchetypePipeline(cand.proposed_archetype_id as string, allSymbols)
  } catch (e) {
    console.error(`[approve] pipeline crashed for ${cand.proposed_archetype_id}:`, e)
    // pipeline internally writes pipeline_status on terminal states; don't overwrite
  }

  const { data: finalArch } = await supabaseAdmin
    .from('theme_archetypes')
    .select('pipeline_status, pipeline_error')
    .eq('id', cand.proposed_archetype_id)
    .single()

  const finalStatus = finalArch?.pipeline_status ?? 'unknown'

  return Response.json({
    ok: true,
    archetype_id: cand.proposed_archetype_id,
    new_tickers: newTickerCount,
    pipeline_status: finalStatus,
    pipeline_error: finalArch?.pipeline_error ?? null,
    message:
      finalStatus === 'ready'
        ? 'Approved and pipeline completed.'
        : `Approved but pipeline ${finalStatus}.`,
  })
}
