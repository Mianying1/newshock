import { supabaseAdmin } from '@/lib/supabase-admin'

interface ThemeRow {
  id: string
  name: string
  category: string
  event_count: number
  theme_strength_score: number
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
    .select('id, name, category, event_count, theme_strength_score')
    .in('id', allThemeIds)

  const themeMap: Record<string, ThemeRow> = {}
  for (const t of themes ?? []) themeMap[t.id] = t

  const hydrated = narratives.map((n) => ({
    ...n,
    related_themes: (n.related_theme_ids as string[])
      .map((id) => themeMap[id])
      .filter(Boolean),
  }))

  return Response.json({ narratives: hydrated })
}
