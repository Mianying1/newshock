import type { ThemeRadarItem } from '@/types/recommendations'

export function getEvents48h(theme: ThemeRadarItem): number {
  return theme.catalysts.filter((c) => c.days_ago <= 2).length
}

export function getSourceDiversity(theme: ThemeRadarItem): number {
  const seen = new Set<string>()
  for (const c of theme.catalysts.slice(0, 12)) {
    if (c.source_name) seen.add(c.source_name)
  }
  return seen.size
}

export function getStageUrgency(stage: string): number {
  const urgency: Record<string, number> = {
    early: 70,
    mid: 40,
    late: 90,
    beyond: 100,
    beyond_typical: 100,
    unknown: 50,
  }
  return urgency[stage] ?? 50
}

export function getTodayPriority(theme: ThemeRadarItem): number {
  const strength = theme.theme_strength_score ?? 0
  const velocity = getEvents48h(theme)
  const urgency = getStageUrgency(theme.playbook_stage)
  const tierBonus = theme.theme_tier === 'umbrella' ? 10 : 0

  return strength * 0.4 + velocity * 10 * 0.3 + urgency * 0.3 + tierBonus
}

export function getFocusRank(theme: ThemeRadarItem): number {
  const s = theme.theme_strength_score ?? 0
  if (s >= 80) return 4
  if (s >= 55) return 3
  if (s >= 30) return 2
  return 1
}

export function getOngoingTop3(themes: ThemeRadarItem[]): ThemeRadarItem[] {
  return themes
    .filter((th) => th.status === 'active')
    .sort((a, b) => {
      const focusDiff = getFocusRank(b) - getFocusRank(a)
      if (focusDiff !== 0) return focusDiff
      return (b.days_active ?? 0) - (a.days_active ?? 0)
    })
    .slice(0, 3)
}
