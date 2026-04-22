import { supabaseAdmin } from '@/lib/supabase-admin'

interface ThemeRow {
  id: string
  name: string
  name_zh: string | null
  event_count: number
  theme_strength_score: number
  theme_archetypes: { category: string }[] | null
}

export async function GET() {
  const { data: narratives, error } = await supabaseAdmin
    .from('market_narratives')
    .select('*')
    .eq('is_active', true)
    .order('rank', { ascending: true })

  if (error) return Response.json({ narratives: [] }, { status: 500 })
  if (!narratives || narratives.length === 0) return Response.json({ narratives: [] })

  const allThemeIds = narratives.flatMap((n) => n.related_theme_ids as string[])
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, name_zh, event_count, theme_strength_score, theme_archetypes(category)')
    .in('id', allThemeIds)

  const themeMap: Record<string, ThemeRow> = {}
  for (const t of themes ?? []) themeMap[t.id] = t

  const hydrated = narratives.map((n) => ({
    ...n,
    related_themes: (n.related_theme_ids as string[])
      .map((id) => {
        const t = themeMap[id]
        if (!t) return null
        return {
          id,
          name: t.name,
          name_zh: t.name_zh ?? null,
          category: t.theme_archetypes?.[0]?.category ?? 'unknown',
          event_count: t.event_count,
        }
      })
      .filter(Boolean),
  }))

  return Response.json({ narratives: hydrated })
}
