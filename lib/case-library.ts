import { supabaseAdmin } from './supabase-admin'

export type CaseConfidence = 'high' | 'medium' | 'low'
export type CaseDataSource = 'manual' | 'ai_sourced' | 'news_archive'

export interface HistoricalCase {
  id: string
  archetype_id: string
  case_name: string
  case_name_zh: string | null
  start_date: string | null
  end_date: string | null
  trigger_type: string | null
  duration_days: number | null
  main_beneficiaries: string[]
  main_losers: string[]
  fade_signals: unknown | null
  stage_progression: unknown | null
  notes: string | null
  notes_zh: string | null
  data_source: CaseDataSource
  confidence: CaseConfidence
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface HistoricalCaseInput {
  archetype_id: string
  case_name: string
  case_name_zh?: string | null
  start_date?: string | null
  end_date?: string | null
  trigger_type?: string | null
  duration_days?: number | null
  main_beneficiaries?: string[]
  main_losers?: string[]
  fade_signals?: unknown | null
  stage_progression?: unknown | null
  notes?: string | null
  notes_zh?: string | null
  data_source: CaseDataSource
  confidence: CaseConfidence
  created_by?: string | null
}

export async function getRelevantCases(
  archetypeId: string,
  limit = 5
): Promise<HistoricalCase[]> {
  const { data, error } = await supabaseAdmin
    .from('historical_cases')
    .select('*')
    .eq('archetype_id', archetypeId)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) {
    console.error('[case-library] getRelevantCases error:', error.message)
    return []
  }
  return (data ?? []) as HistoricalCase[]
}

export async function seedCase(input: HistoricalCaseInput): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('historical_cases')
    .insert({
      archetype_id: input.archetype_id,
      case_name: input.case_name,
      case_name_zh: input.case_name_zh ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      trigger_type: input.trigger_type ?? null,
      duration_days: input.duration_days ?? null,
      main_beneficiaries: input.main_beneficiaries ?? [],
      main_losers: input.main_losers ?? [],
      fade_signals: input.fade_signals ?? null,
      stage_progression: input.stage_progression ?? null,
      notes: input.notes ?? null,
      notes_zh: input.notes_zh ?? null,
      data_source: input.data_source,
      confidence: input.confidence,
      created_by: input.created_by ?? null,
    })
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`seedCase failed: ${error?.message ?? 'no data'}`)
  }
  return data.id as string
}

export async function listCasesByArchetype(): Promise<
  Array<{ archetype_id: string; archetype_name: string; cases: HistoricalCase[] }>
> {
  const [casesRes, archetypesRes] = await Promise.all([
    supabaseAdmin
      .from('historical_cases')
      .select('*')
      .order('start_date', { ascending: false, nullsFirst: false }),
    supabaseAdmin.from('theme_archetypes').select('id, name'),
  ])
  const cases = (casesRes.data ?? []) as HistoricalCase[]
  const archetypes = (archetypesRes.data ?? []) as { id: string; name: string }[]
  const nameById = new Map(archetypes.map((a) => [a.id, a.name]))
  const grouped = new Map<string, HistoricalCase[]>()
  for (const c of cases) {
    const arr = grouped.get(c.archetype_id) ?? []
    arr.push(c)
    grouped.set(c.archetype_id, arr)
  }
  return archetypes
    .map((a) => ({
      archetype_id: a.id,
      archetype_name: nameById.get(a.id) ?? a.id,
      cases: grouped.get(a.id) ?? [],
    }))
    .sort((x, y) => y.cases.length - x.cases.length)
}

// TODO Phase 5 full · case-driven playbook generation
// 改 lib/archetype-pipeline.ts generatePlaybook:
//   1. cases = await getRelevantCases(archetypeId, 3)
//   2. Sonnet 基于 cases 写 playbook (不是自由发挥) ·
//      prompt 注入 case 名称 / 时间 / 受益方 / fade 信号 · 要求 Sonnet 直接引用.
//   3. 若 cases.length === 0 · fallback 到当前 free-generation 模式并标记
//      `playbook.sourcing = 'no_cases_available'`.
