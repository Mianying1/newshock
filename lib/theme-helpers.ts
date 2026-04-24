import type { ThemeRadarItem, ArchetypePlaybook } from '@/types/recommendations'
import { getEvents48h, getSourceDiversity } from '@/lib/theme-priority'

export interface WhyNowReason {
  key: string
  params?: Record<string, string | number>
}

export function generateWhyNow(theme: ThemeRadarItem): WhyNowReason[] {
  const reasons: WhyNowReason[] = []
  const events48h = getEvents48h(theme)
  const sources = getSourceDiversity(theme)

  if (events48h >= 3) {
    reasons.push({ key: 'whynow.events_48h', params: { count: events48h } })
  }
  if (sources >= 3) {
    reasons.push({ key: 'whynow.source_diversity', params: { count: sources } })
  }

  if (reasons.length === 0) {
    const stage = theme.playbook_stage
    if (stage === 'early') reasons.push({ key: 'whynow.fallback_early' })
    else if (stage === 'mid') reasons.push({ key: 'whynow.fallback_mid' })
    else if (stage === 'late' || stage === 'beyond') reasons.push({ key: 'whynow.fallback_late' })
    else reasons.push({ key: 'whynow.fallback_active' })
  }

  return reasons.slice(0, 2)
}

export function getExpectedDuration(theme: ThemeRadarItem): number {
  const pb = theme.archetype_playbook
  const [minDays, maxDays] = pb?.typical_duration_days_approx ?? [0, 0]
  if (maxDays > 0) return maxDays
  if (minDays > 0) return minDays
  return 90
}

export function calcProgress(theme: ThemeRadarItem): number {
  const days = theme.days_hot ?? 0
  const expected = getExpectedDuration(theme)
  if (expected <= 0) return 10
  return Math.min(100, Math.max(2, (days / expected) * 100))
}

export interface StageReadout {
  bigKey: string
  transitionKey: string
}

export function getStageReadout(stage: string): StageReadout {
  switch (stage) {
    case 'early':
      return { bigKey: 'stage.early', transitionKey: 'stage.transition_early_mid' }
    case 'mid':
      return { bigKey: 'stage.mid', transitionKey: 'stage.transition_mid_late' }
    case 'late':
      return { bigKey: 'stage.late', transitionKey: 'stage.transition_late_exit' }
    case 'beyond':
      return { bigKey: 'stage.beyond', transitionKey: 'stage.transition_beyond' }
    default:
      return { bigKey: 'stage.tracking', transitionKey: 'stage.transition_tracking' }
  }
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max).replace(/[,，。;；]\s*$/, '') + '…'
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

export function getStageAlertHeadline(
  theme: ThemeRadarItem,
  locale: 'en' | 'zh',
  t: Translator,
): string {
  const pb = (locale === 'zh' ? theme.archetype_playbook_zh : theme.archetype_playbook) as ArchetypePlaybook | null
  const stage = theme.playbook_stage
  const maxLen = locale === 'zh' ? 30 : 60

  const observation = pb?.this_time_different?.observation
  if (observation && observation.trim().length > 0) {
    return truncate(observation, maxLen)
  }

  if ((stage === 'late' || stage === 'beyond') && pb?.exit_signals?.[0]) {
    const prefix = t('narratives.alert_approaching_exit')
    return prefix + truncate(pb.exit_signals[0], maxLen - prefix.length)
  }

  switch (stage) {
    case 'early':
      return t('narratives.alert_early')
    case 'mid':
      return t('narratives.alert_mid')
    case 'late':
      return t('narratives.alert_late')
    case 'beyond':
      return t('narratives.alert_beyond')
    default:
      return t('narratives.alert_default')
  }
}

export interface UrgencyReadout {
  labelKey: string
  score: number
}

export function getUrgencyScore(theme: ThemeRadarItem): UrgencyReadout {
  const events48h = getEvents48h(theme)
  const strength = theme.theme_strength_score ?? 0
  const stage = theme.playbook_stage

  const stageWeightMap: Record<string, number> = {
    early: 40,
    mid: 60,
    late: 90,
    beyond: 100,
    unknown: 50,
  }
  const stageWeight = stageWeightMap[stage] ?? 50
  const velocityWeight = Math.min(events48h * 10, 40)
  const strengthWeight = strength * 0.3

  const score = stageWeight + velocityWeight + strengthWeight

  if (score >= 120) return { labelKey: 'urgency.immediate', score }
  if (score >= 90) return { labelKey: 'urgency.accelerating', score }
  if (score >= 60) return { labelKey: 'urgency.structural', score }
  return { labelKey: 'urgency.watching', score }
}
