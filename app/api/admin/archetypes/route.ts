import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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
  return Response.json({ ok: true, id: data.id })
}
