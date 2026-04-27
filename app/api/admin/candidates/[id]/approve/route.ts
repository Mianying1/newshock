import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runArchetypePipeline } from '@/lib/archetype-pipeline'
import { anthropic, MODEL_HAIKU } from '@/lib/anthropic'
import { linkEventsToTheme } from '@/lib/theme-event-linker'

export const maxDuration = 120

async function extractTriggerKeywords(input: {
  title: string
  description: string
  category: string
}): Promise<string[]> {
  const prompt =
    `Extract 8-15 short matching keywords for a thematic-investing archetype.\n\n` +
    `Title: ${input.title}\n` +
    `Category: ${input.category}\n` +
    `Description: ${input.description}\n\n` +
    `Rules:\n` +
    `- Each keyword 1-3 words, lowercase\n` +
    `- Specific enough to identify news that belongs to this theme (avoid "stock", "market", "company")\n` +
    `- Mix of: entities, products/tech, regulators, action verbs, distinctive industry jargon\n` +
    `- No tickers, no years, no full sentences\n\n` +
    `Return ONLY a JSON array of strings. No prose.`
  try {
    const resp = await anthropic.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content
      .flatMap((c) => (c.type === 'text' ? [c.text] : []))
      .join('')
      .trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0]) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.toLowerCase().trim())
      .filter((s) => s.length > 0 && s.length <= 40)
      .slice(0, 15)
  } catch (e) {
    console.warn(`[approve.extractTriggerKeywords] ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

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

  // Extract trigger_keywords from title/description via Haiku before insert
  // (was previously seeded empty, blocking classifier from matching new ingest)
  const triggerKeywords = await extractTriggerKeywords({
    title: cand.title as string,
    description: cand.description as string,
    category: cand.category as string,
  })

  const nameFirstPart = (cand.title as string).split(' · ')[0] || cand.title
  const { error: archErr } = await supabaseAdmin.from('theme_archetypes').insert({
    id: cand.proposed_archetype_id,
    name: nameFirstPart,
    category: cand.category,
    description: cand.description,
    is_active: true,
    trigger_keywords: triggerKeywords,
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

  // Create the seed theme for this archetype + force-attach evidence events +
  // run window-period backfill. Approve previously left the archetype empty
  // (no theme row, no events linked) — the candidate's evidence and any
  // window-period news that should have matched stayed orphaned.
  const evidenceIds: string[] = Array.isArray(cand.evidence_event_ids)
    ? (cand.evidence_event_ids as string[]).filter((x): x is string => typeof x === 'string')
    : []
  const validTickerSymbols: string[] = []
  if (allSymbols.length > 0) {
    const { data: validRows } = await supabaseAdmin
      .from('tickers')
      .select('symbol')
      .in('symbol', allSymbols)
    for (const r of validRows ?? []) validTickerSymbols.push((r as { symbol: string }).symbol)
  }

  const nowIso = new Date().toISOString()
  const themeName = cand.title as string
  const { data: newTheme, error: themeErr } = await supabaseAdmin
    .from('themes')
    .insert({
      archetype_id: cand.proposed_archetype_id,
      name: themeName,
      name_zh: cand.title_zh ?? null,
      summary: cand.description,
      summary_zh: cand.description_zh ?? null,
      status: 'active',
      institutional_awareness: 'early',
      theme_strength_score: 55,
      classification_confidence: 60,
      theme_tier: 'subtheme',
      event_count: 0,
      first_seen_at: nowIso,
      last_active_at: nowIso,
    })
    .select('id')
    .single()

  let themeId: string | null = null
  let evidenceLinked = 0
  let windowLinked = 0
  let themeError: string | null = null

  if (themeErr || !newTheme) {
    themeError = themeErr?.message ?? 'theme insert failed'
    console.error(`[approve] theme insert failed for ${cand.proposed_archetype_id}: ${themeError}`)
  } else {
    themeId = newTheme.id as string

    if (validTickerSymbols.length > 0) {
      const tickerMeta = new Map<string, string | null>()
      for (const t of tickers) tickerMeta.set(t.symbol, t.reasoning ?? null)
      const recRows = validTickerSymbols.map((symbol) => ({
        theme_id: themeId,
        ticker_symbol: symbol,
        tier: 1,
        role_reasoning: tickerMeta.get(symbol) ?? null,
        role_reasoning_zh: null,
        exposure_direction: 'uncertain',
      }))
      const { error: recErr } = await supabaseAdmin
        .from('theme_recommendations')
        .insert(recRows)
      if (recErr) {
        console.warn(`[approve] theme_recommendations insert: ${recErr.message}`)
      }
    }

    // Step 1: force-attach the candidate's evidence events to the new theme
    // (these were unmatched at scan time and may have since been mis-routed
    // to exploratory themes — overwrite unconditionally per audit spec).
    if (evidenceIds.length > 0) {
      const { data: linked, error: evidenceErr } = await supabaseAdmin
        .from('events')
        .update({ trigger_theme_id: themeId })
        .in('id', evidenceIds)
        .select('id')
      if (evidenceErr) {
        console.warn(`[approve] evidence backfill: ${evidenceErr.message}`)
      } else {
        evidenceLinked = linked?.length ?? 0
      }
    }

    // Step 3: window-period backfill — sweep events created after the
    // candidate scan that are still unmatched, hand them to Sonnet through
    // linkEventsToTheme to confirm membership.
    try {
      const r = await linkEventsToTheme(themeId)
      windowLinked = r.confirmed
    } catch (e) {
      console.warn(`[approve] window backfill threw: ${e instanceof Error ? e.message : String(e)}`)
    }

    const totalLinked = evidenceLinked + windowLinked
    if (totalLinked > 0) {
      await supabaseAdmin
        .from('themes')
        .update({ event_count: totalLinked, last_active_at: new Date().toISOString() })
        .eq('id', themeId)
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
    theme_id: themeId,
    theme_error: themeError,
    new_tickers: newTickerCount,
    trigger_keywords_count: triggerKeywords.length,
    evidence_linked: evidenceLinked,
    window_linked: windowLinked,
    pipeline_status: finalStatus,
    pipeline_error: finalArch?.pipeline_error ?? null,
    message:
      finalStatus === 'ready'
        ? 'Approved and pipeline completed.'
        : `Approved but pipeline ${finalStatus}.`,
  })
}
