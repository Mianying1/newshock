import { supabaseAdmin } from './supabase-admin'

export interface Archetype {
  id: string
  name: string
  category: string
  description: string | null
  trigger_keywords: string[]
  typical_tickers: {
    tier1?: string[]
    tier2?: string[]
    tier3?: string[]
    dynamic?: boolean
  } | null
  typical_duration_days_min: number | null
  typical_duration_days_max: number | null
  confidence_level: string
  exclusion_rules: string[] | null
  notes: string | null
}

export interface ActiveTheme {
  id: string
  name: string
  archetype_id: string | null
  summary: string | null
  last_active_at: string
  theme_strength_score: number
  institutional_awareness: string
}

export async function loadActiveArchetypes(): Promise<Archetype[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select(
      'id, name, category, description, trigger_keywords, typical_tickers, ' +
      'typical_duration_days_min, typical_duration_days_max, confidence_level, ' +
      'exclusion_rules, notes'
    )
    .eq('is_active', true)
    .order('category')
    .order('id')

  if (error) throw new Error(`Failed to load archetypes: ${error.message}`)
  return (data ?? []) as unknown as Archetype[]
}

export async function loadActiveThemes(days = 30): Promise<ActiveTheme[]> {
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id, summary, last_active_at, theme_strength_score, institutional_awareness')
    .eq('status', 'active')
    .gt('last_active_at', cutoff)
    .order('last_active_at', { ascending: false })

  if (error) throw new Error(`Failed to load active themes: ${error.message}`)
  return (data ?? []) as ActiveTheme[]
}

export function formatArchetypesForPrompt(archetypes: Archetype[]): string {
  return archetypes
    .map((a) => {
      const t = a.typical_tickers ?? {}
      const t1 = (t.tier1 ?? []).join(', ') || '—'
      const t2 = (t.tier2 ?? []).join(', ') || '—'
      const t3 = (t.tier3 ?? []).join(', ') || '—'
      const dynamic = t.dynamic ? ' [DYNAMIC: ignore archetype tickers, use your judgment]' : ''
      const excl = (a.exclusion_rules ?? []).map((r) => `  ✗ ${r}`).join('\n')
      return (
        `### ${a.id}\n` +
        `Name: ${a.name} | Category: ${a.category} | Confidence: ${a.confidence_level}\n` +
        `${a.description ?? ''}\n` +
        `Keywords: ${a.trigger_keywords.join(', ')}\n` +
        `Tickers${dynamic}: tier1=[${t1}] tier2=[${t2}] tier3=[${t3}]\n` +
        `Exclusions:\n${excl}` +
        (a.notes ? `\nNotes: ${a.notes}` : '')
      )
    })
    .join('\n\n')
}

export function formatActiveThemesForPrompt(themes: ActiveTheme[]): string {
  if (themes.length === 0) return '(none)'
  return themes
    .map(
      (t) =>
        `- id=${t.id}\n` +
        `  name="${t.name}" | archetype=${t.archetype_id ?? 'exploratory'} | strength=${t.theme_strength_score}\n` +
        `  last_active=${t.last_active_at.slice(0, 10)} | summary: ${t.summary ?? '(none)'}`
    )
    .join('\n')
}
