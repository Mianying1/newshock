import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'

export const maxDuration = 180

const UNMATCHED_LIMIT = 60
const MATCHED_CONTEXT_LIMIT = 20

interface SonnetCandidate {
  proposed_archetype_id: string
  title: string
  title_zh?: string | null
  category: string
  description: string
  description_zh?: string | null
  initial_tickers?: { symbol: string; reasoning?: string }[]
  evidence_event_ids?: string[]
  why_this_matters?: string
  estimated_importance?: string
  similar_to_existing?: string | null
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  // Skip if <10 unmatched events in last 24h — cron now runs weekdays so most
  // days won't have enough signal to propose a new archetype. Save Sonnet cost.
  const cutoff24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: unmatched24h } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .is('trigger_theme_id', null)
    .gte('created_at', cutoff24h)

  if ((unmatched24h ?? 0) < 10) {
    return Response.json({
      ok: true,
      skipped: true,
      scan_date: now,
      unmatched_24h: unmatched24h ?? 0,
      reason: 'Not enough unmatched events in last 24h (<10)',
    })
  }

  // 1. Existing active archetypes (for dedupe + context)
  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, created_at')
    .eq('is_active', true)

  const archetypeList =
    archetypes?.map((a) => `- ${a.id} (${a.category ?? 'n/a'}): ${a.name}`).join('\n') ?? ''

  const recentApproved =
    archetypes
      ?.filter((a) => a.created_at && a.created_at >= thirtyAgo)
      .map((a) => `- ${a.id}: ${a.name}`)
      .join('\n') ?? ''

  // 2. Pull past-7d events. Split by trigger_theme_id (matched) vs null (unmatched).
  const { data: recentEvents } = await supabaseAdmin
    .from('events')
    .select('id, headline, source_name, source_url, event_date, mentioned_tickers, trigger_theme_id')
    .gte('event_date', weekAgo)
    .order('event_date', { ascending: false })
    .limit(500)

  const all = recentEvents ?? []
  const unmatched = all.filter((e) => !e.trigger_theme_id).slice(0, UNMATCHED_LIMIT)
  const matched = all.filter((e) => e.trigger_theme_id).slice(0, MATCHED_CONTEXT_LIMIT)

  if (unmatched.length === 0) {
    return Response.json({
      ok: true,
      scan_date: now,
      total_events: all.length,
      unmatched_count: 0,
      message: 'No unmatched events in past 7 days — skipping scan.',
      inserted: 0,
    })
  }

  const formatEvent = (e: (typeof all)[number]) => {
    const tickers = Array.isArray(e.mentioned_tickers) && e.mentioned_tickers.length
      ? ` [${(e.mentioned_tickers as string[]).slice(0, 4).join(',')}]`
      : ''
    return `  ${e.id} · ${e.event_date} · ${e.source_name ?? 'Press'}${tickers}\n    ${e.headline}`
  }

  const unmatchedBlock = unmatched.map(formatEvent).join('\n')
  const matchedBlock = matched.map(formatEvent).join('\n')

  // 3. Sonnet scan prompt, grounded in real events.
  const prompt = `You are a senior market research analyst. Today is ${now}.

Newshock ingested ${all.length} events in the past 7 days (${weekAgo} → ${now}).
Of those, ${unmatched.length} are UNMATCHED — no existing archetype claimed them.
These unmatched events are the primary signal for emerging themes.

Existing active archetypes (${archetypes?.length ?? 0}) — do NOT propose duplicates:
${archetypeList}

${recentApproved ? `Archetypes approved in last 30 days (be cautious about proposing near-duplicates):\n${recentApproved}\n` : ''}

━━ UNMATCHED EVENTS (primary signal, ${unmatched.length} events) ━━
${unmatchedBlock}

━━ MATCHED EVENTS (context only, ${matched.length} sampled) ━━
${matchedBlock}

TASK:
1. Cluster the UNMATCHED events into 0–5 emerging archetype candidates.
2. Each candidate MUST cite ≥3 specific event ids from the UNMATCHED list as evidence.
3. Do NOT invent themes. If the unmatched events are noise or one-off, return fewer candidates — an empty list is acceptable.
4. If a candidate substantially overlaps with an existing archetype, set similar_to_existing to that archetype id and explain why it is still a distinct theme in description (or omit the candidate).
5. Tickers must be real US-listed (NYSE/NASDAQ), market cap > $500M, traceable to the cited events.

Return a JSON ARRAY with this exact shape (no prose, no markdown):
[
  {
    "proposed_archetype_id": "snake_case_id",
    "title": "English theme name · subtitle",
    "title_zh": "中文主题名称 · 副标题",
    "category": "ai_semi | geopolitics | supply_chain | pharma | macro_monetary | defense | energy | crypto | consumer | materials",
    "description": "3–4 sentences explaining the causal story grounded in the cited events.",
    "description_zh": "3–4 句中文阐述, 使用专业金融术语 (暴露 / 受益 / 承压 / 供应链 / 监管拐点).",
    "initial_tickers": [{"symbol": "XXX", "reasoning": "1 sentence tying ticker to cited events"}],
    "evidence_event_ids": ["<event_id_1>", "<event_id_2>", "<event_id_3>"],
    "why_this_matters": "1 sentence on why this is a standalone theme, not noise and not covered.",
    "estimated_importance": "high | medium | low",
    "similar_to_existing": "<existing_archetype_id or null>"
  }
]

BILINGUAL RULES:
- title_zh & description_zh required. Preserve tickers/years/brand names.
- Omit fields you cannot ground in evidence.
Return JSON array only.`

  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)

  if (!jsonMatch) {
    return Response.json(
      { error: 'failed to parse JSON response', raw: text.slice(0, 300) },
      { status: 500 }
    )
  }

  const unmatchedIdSet = new Set(unmatched.map((e) => e.id))
  const candidates: SonnetCandidate[] = JSON.parse(jsonMatch[0])

  let inserted = 0
  let skippedDuplicate = 0
  let skippedLowEvidence = 0

  for (const c of candidates) {
    const evidenceRaw = Array.isArray(c.evidence_event_ids) ? c.evidence_event_ids : []
    const evidence = evidenceRaw.filter((id) => typeof id === 'string' && unmatchedIdSet.has(id))
    if (evidence.length < 3) {
      skippedLowEvidence++
      continue
    }

    const { data: existingArch } = await supabaseAdmin
      .from('theme_archetypes')
      .select('id')
      .eq('id', c.proposed_archetype_id)
      .maybeSingle()
    if (existingArch) {
      skippedDuplicate++
      continue
    }

    const { data: existingCand } = await supabaseAdmin
      .from('archetype_candidates')
      .select('id')
      .eq('proposed_archetype_id', c.proposed_archetype_id)
      .eq('status', 'pending')
      .maybeSingle()
    if (existingCand) {
      skippedDuplicate++
      continue
    }

    const evidenceHeadlines = evidence
      .map((id) => unmatched.find((e) => e.id === id)?.headline)
      .filter((h): h is string => Boolean(h))

    const { error } = await supabaseAdmin.from('archetype_candidates').insert({
      proposed_archetype_id: c.proposed_archetype_id,
      title: c.title,
      title_zh: c.title_zh ?? null,
      category: c.category,
      description: c.description,
      description_zh: c.description_zh ?? null,
      initial_tickers: c.initial_tickers ?? [],
      recent_events: evidenceHeadlines,
      evidence_event_ids: evidence,
      similar_to_existing: c.similar_to_existing ?? null,
      why_this_matters: c.why_this_matters ?? null,
      estimated_importance: c.estimated_importance ?? 'medium',
      scan_date: now,
      status: 'pending',
    })

    if (error) {
      console.error(`Insert failed for ${c.proposed_archetype_id}:`, error.message)
    } else {
      inserted++
    }
  }

  return Response.json({
    ok: true,
    scan_date: now,
    total_events: all.length,
    unmatched_count: unmatched.length,
    total_candidates: candidates.length,
    inserted,
    skipped_as_duplicate: skippedDuplicate,
    skipped_low_evidence: skippedLowEvidence,
    message: `${inserted} new candidates ready for review at /admin/candidates`,
  })
}
