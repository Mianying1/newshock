import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Skip if we already generated today. Column is `generated_at` (not created_at);
  // the previous query silently errored and never actually skipped, so retries
  // would double-insert. Compare against today's UTC midnight.
  const todayUtc = new Date().toISOString().slice(0, 10)
  const todayMidnightIso = `${todayUtc}T00:00:00.000Z`
  const { data: todayExisting, error: todayErr } = await supabaseAdmin
    .from('market_narratives')
    .select('id')
    .gte('generated_at', todayMidnightIso)
    .limit(1)

  if (todayErr) {
    Sentry.captureException(todayErr, { tags: { stage: 'mn_today_check' } })
    return Response.json({ error: `today_check_failed: ${todayErr.message}` }, { status: 500 })
  }

  if (todayExisting && todayExisting.length > 0) {
    return Response.json({ skipped: true, reason: 'Already generated today', date: todayUtc })
  }

  const { data: themes, error: themesErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, event_count, theme_strength_score, theme_archetypes(category)')
    .eq('status', 'active')
    .gte('event_count', 2)
    .order('theme_strength_score', { ascending: false })
    .limit(25)

  if (themesErr) {
    Sentry.captureException(themesErr, { tags: { stage: 'mn_fetch_themes' } })
    return Response.json({ error: `fetch_themes_failed: ${themesErr.message}` }, { status: 500 })
  }

  if (!themes || themes.length < 3) {
    Sentry.captureMessage('generate-narratives: not enough active themes', {
      level: 'warning',
      tags: { stage: 'mn_gate' },
      extra: { count: themes?.length ?? 0 },
    })
    return Response.json({ message: 'Not enough active themes', count: themes?.length ?? 0 })
  }

  const NARRATIVE_PROMPT = `You are a senior investment strategist summarizing market narratives from active themes.

Current active themes:
${JSON.stringify(themes.map((t) => ({ id: t.id, name: t.name, category: (t.theme_archetypes as { category?: string } | null)?.category ?? 'unknown', events: t.event_count, strength: t.theme_strength_score })), null, 2)}

Task: Identify 2-3 dominant market narratives that synthesize multiple themes into a cohesive storyline.
- A narrative groups 2-5 related themes with common drivers
- Do NOT just list themes — synthesize the overarching causal story
- Avoid investment recommendations, use observational language
- Each narrative must group 2+ themes logically
- English title max 6 words; Chinese title ≤ 10 characters
- description: 1-2 sentences (English); description_zh: same meaning in professional Chinese, using standard finance terminology
- Preserve tickers/years/brand names unchanged

Return JSON only:
[{"title": "...", "title_zh": "...", "description": "1-2 sentences", "description_zh": "1-2 句中文概述", "related_theme_ids": ["uuid1", "uuid2"], "rank": 1}]`

  let response
  try {
    response = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: 'user', content: NARRATIVE_PROMPT }],
    })
  } catch (e) {
    Sentry.captureException(e, { tags: { stage: 'mn_sonnet_call' } })
    return Response.json({ error: 'sonnet_failed', message: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.replace(/```json\n?|\n?```/g, '').trim().match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    Sentry.captureMessage('generate-narratives: Sonnet output failed JSON parse', {
      level: 'error',
      tags: { stage: 'mn_parse' },
      extra: { raw_preview: text.slice(0, 300) },
    })
    return Response.json({ error: 'Parse failed', raw: text.slice(0, 200) }, { status: 500 })
  }

  let narratives: {
    title: string
    title_zh?: string | null
    description: string
    description_zh?: string | null
    related_theme_ids: string[]
    rank: number
  }[]
  try {
    narratives = JSON.parse(jsonMatch[0])
  } catch (e) {
    Sentry.captureException(e, { tags: { stage: 'mn_json_parse' }, extra: { raw_preview: jsonMatch[0].slice(0, 300) } })
    return Response.json({ error: 'JSON parse threw' }, { status: 500 })
  }

  const { error: deactErr } = await supabaseAdmin.from('market_narratives').update({ is_active: false }).eq('is_active', true)
  if (deactErr) Sentry.captureException(deactErr, { tags: { stage: 'mn_deactivate' } })

  const results = []
  for (const n of narratives) {
    const validIds = n.related_theme_ids.filter((id) => themes.some((t) => t.id === id))
    if (validIds.length < 2) continue

    const { data: recs } = await supabaseAdmin
      .from('theme_recommendations')
      .select('ticker_symbol, theme_id')
      .in('theme_id', validIds)

    const uniqueTickers = Array.from(new Set((recs ?? []).map((r) => r.ticker_symbol)))
    const tickerThemes: Record<string, Set<string>> = {}
    for (const r of recs ?? []) {
      if (!tickerThemes[r.ticker_symbol]) tickerThemes[r.ticker_symbol] = new Set()
      tickerThemes[r.ticker_symbol].add(r.theme_id)
    }
    const chokepoints = Object.entries(tickerThemes)
      .filter(([, s]) => s.size >= 2)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5)
      .map(([symbol]) => symbol)

    const { error: insErr } = await supabaseAdmin.from('market_narratives').insert({
      title: n.title,
      title_zh: n.title_zh ?? null,
      description: n.description,
      description_zh: n.description_zh ?? null,
      related_theme_ids: validIds,
      aggregate_ticker_count: uniqueTickers.length,
      top_chokepoint_tickers: chokepoints,
      rank: n.rank ?? 1,
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    })
    if (insErr) {
      Sentry.captureException(insErr, { tags: { stage: 'mn_insert' }, extra: { title: n.title } })
      continue
    }
    results.push({ title: n.title, themes: validIds.length, tickers: uniqueTickers.length })
  }

  // Alert if cron passed all gates but wrote nothing — masks silent regressions
  // (LLM returned 0 valid candidates, every insert errored, schema drift, etc).
  if (results.length === 0) {
    Sentry.captureMessage('generate-narratives wrote 0 rows', {
      level: 'error',
      tags: { stage: 'mn_zero_inserted' },
      extra: { themes_considered: themes.length, candidates_returned: narratives.length },
    })
  }

  return Response.json({ generated: results.length, narratives: results })
}
