import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { spawnThemeFromArchetype } from '@/lib/archetype-pipeline'

export const maxDuration = 300

interface CreateBody {
  id: string
  name: string
  category: string
  description?: string
  trigger_keywords?: string[]
  typical_tickers?: { symbol: string; reasoning?: string }[]
  typical_duration_days_min?: number | null
  typical_duration_days_max?: number | null
  confidence_level?: 'high' | 'medium' | 'low'
  notes?: string
  spawn_theme?: {
    name_zh?: string | null
    description_zh?: string | null
    priority?: 'high' | 'medium' | 'low'
    suggested_tickers?: string[]
    covers_unmatched_events?: string[]
    report_id?: string | null
  }
}

export async function POST(request: NextRequest) {
  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.id || !body.name || !body.category) {
    return Response.json({ error: 'id, name, category required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id')
    .eq('id', body.id)
    .maybeSingle()

  if (existing) {
    return Response.json({ error: 'archetype id already exists' }, { status: 409 })
  }

  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .insert({
      id: body.id,
      name: body.name,
      category: body.category,
      description: body.description ?? null,
      trigger_keywords: body.trigger_keywords ?? [],
      typical_tickers: body.typical_tickers ?? [],
      typical_duration_days_min: body.typical_duration_days_min ?? null,
      typical_duration_days_max: body.typical_duration_days_max ?? null,
      confidence_level: body.confidence_level ?? 'medium',
      notes: body.notes ?? null,
      is_active: true,
      created_by: 'coverage_audit',
    })
    .select('id')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (body.spawn_theme) {
    try {
      const spawn = await spawnThemeFromArchetype(
        data.id,
        {
          name: body.name,
          name_zh: body.spawn_theme.name_zh ?? null,
          description: body.description ?? null,
          description_zh: body.spawn_theme.description_zh ?? null,
          category: body.category,
          priority: body.spawn_theme.priority ?? 'medium',
          suggested_tickers: body.spawn_theme.suggested_tickers ?? (body.typical_tickers ?? []).map((t) => t.symbol),
          covers_unmatched_events: body.spawn_theme.covers_unmatched_events ?? [],
        },
        body.spawn_theme.report_id ?? null
      )
      return Response.json({
        ok: true,
        id: data.id,
        theme_id: spawn.theme_id,
        recs_count: spawn.recs_count,
        events_linked: spawn.events_linked,
        failed_tickers: spawn.failed_tickers,
        enrich_ok: spawn.enrich_ok,
        enrich_error: spawn.enrich_error ?? null,
        enrich_kept: spawn.enrich_kept ?? null,
        enrich_removed: spawn.enrich_removed ?? null,
      })
    } catch (e) {
      return Response.json(
        {
          ok: true,
          id: data.id,
          spawn_error: e instanceof Error ? e.message : String(e),
        },
        { status: 207 }
      )
    }
  }

  return Response.json({ ok: true, id: data.id })
}
