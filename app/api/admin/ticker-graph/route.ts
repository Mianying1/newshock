import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface FitRow {
  ticker_symbol: string
  archetype_id: string
  fit_score: number
  exposure_label: string | null
  relationship_type: string | null
  evidence_summary: string | null
  evidence_summary_zh: string | null
  data_source: string
  last_validated_at: string | null
  updated_at: string | null
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const archetypeId = sp.get('archetype_id')
  const pendingOnly = sp.get('pending') === '1'
  const minFit = parseFloat(sp.get('min_fit') ?? '0')
  const limit = Math.min(1000, Math.max(1, parseInt(sp.get('limit') ?? '300', 10)))

  let q = supabaseAdmin
    .from('ticker_archetype_fit')
    .select('*')
    .order('archetype_id')
    .order('fit_score', { ascending: false })
    .limit(limit)

  if (archetypeId) q = q.eq('archetype_id', archetypeId)
  if (!Number.isNaN(minFit) && minFit > 0) q = q.gte('fit_score', minFit)
  if (pendingOnly) q = q.neq('data_source', 'manual')

  const [fitsRes, archesRes, typicalRes] = await Promise.all([
    q,
    supabaseAdmin.from('theme_archetypes').select('id, name, category'),
    supabaseAdmin.from('theme_archetypes').select('id, typical_tickers'),
  ])

  if (fitsRes.error) {
    return Response.json({ error: fitsRes.error.message, rows: [] }, { status: 500 })
  }

  const archMap = new Map<string, { name: string; category: string | null }>()
  for (const a of (archesRes.data ?? []) as { id: string; name: string; category: string | null }[]) {
    archMap.set(a.id, { name: a.name, category: a.category })
  }

  const typicalMap = new Map<string, Set<string>>()
  for (const a of (typicalRes.data ?? []) as { id: string; typical_tickers: { tier1?: string[]; tier2?: string[]; tier3?: string[] } | null }[]) {
    const t = a.typical_tickers ?? {}
    const set = new Set([...(t.tier1 ?? []), ...(t.tier2 ?? []), ...(t.tier3 ?? [])].map((s) => s.toUpperCase()))
    typicalMap.set(a.id, set)
  }

  const rows = ((fitsRes.data ?? []) as FitRow[]).map((r) => ({
    ...r,
    archetype_name: archMap.get(r.archetype_id)?.name ?? r.archetype_id,
    archetype_category: archMap.get(r.archetype_id)?.category ?? null,
    in_typical_tickers: typicalMap.get(r.archetype_id)?.has(r.ticker_symbol.toUpperCase()) ?? false,
  }))

  const archetypeCounts = new Map<string, { name: string; category: string | null; count: number }>()
  for (const r of rows) {
    const entry = archetypeCounts.get(r.archetype_id) ?? {
      name: r.archetype_name,
      category: r.archetype_category,
      count: 0,
    }
    entry.count++
    archetypeCounts.set(r.archetype_id, entry)
  }

  const archetypes = Array.from(archetypeCounts.entries()).map(([id, v]) => ({
    id,
    name: v.name,
    category: v.category,
    count: v.count,
  }))

  return Response.json({ rows, archetypes, total: rows.length })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    action: 'approve' | 'reject' | 'edit' | 'approve_batch'
    ticker_symbol?: string
    archetype_id?: string
    fit_score?: number
    exposure_label?: string
    evidence_summary?: string
    evidence_summary_zh?: string
    min_fit_score?: number
    filter_archetype_id?: string | null
  } | null

  if (!body || !body.action) {
    return Response.json({ error: 'action required' }, { status: 400 })
  }

  if (body.action === 'reject') {
    if (!body.ticker_symbol || !body.archetype_id) {
      return Response.json({ error: 'ticker_symbol + archetype_id required' }, { status: 400 })
    }
    const { error } = await supabaseAdmin
      .from('ticker_archetype_fit')
      .delete()
      .eq('ticker_symbol', body.ticker_symbol)
      .eq('archetype_id', body.archetype_id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (body.action === 'edit') {
    if (!body.ticker_symbol || !body.archetype_id) {
      return Response.json({ error: 'ticker_symbol + archetype_id required' }, { status: 400 })
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.fit_score === 'number') patch.fit_score = Math.max(0, Math.min(10, body.fit_score))
    if (typeof body.exposure_label === 'string') patch.exposure_label = body.exposure_label
    if (typeof body.evidence_summary === 'string') patch.evidence_summary = body.evidence_summary
    if (typeof body.evidence_summary_zh === 'string') patch.evidence_summary_zh = body.evidence_summary_zh
    const { error } = await supabaseAdmin
      .from('ticker_archetype_fit')
      .update(patch)
      .eq('ticker_symbol', body.ticker_symbol)
      .eq('archetype_id', body.archetype_id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (body.action === 'approve') {
    if (!body.ticker_symbol || !body.archetype_id) {
      return Response.json({ error: 'ticker_symbol + archetype_id required' }, { status: 400 })
    }
    const { error } = await supabaseAdmin
      .from('ticker_archetype_fit')
      .update({ data_source: 'manual', updated_at: new Date().toISOString() })
      .eq('ticker_symbol', body.ticker_symbol)
      .eq('archetype_id', body.archetype_id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (body.action === 'approve_batch') {
    const threshold = typeof body.min_fit_score === 'number' ? body.min_fit_score : 8
    let q = supabaseAdmin
      .from('ticker_archetype_fit')
      .update({ data_source: 'manual', updated_at: new Date().toISOString() })
      .gte('fit_score', threshold)
      .neq('data_source', 'manual')
    if (body.filter_archetype_id) q = q.eq('archetype_id', body.filter_archetype_id)
    const { error, data } = await q.select('ticker_symbol')
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, approved: data?.length ?? 0 })
  }

  return Response.json({ error: 'unknown action' }, { status: 400 })
}
