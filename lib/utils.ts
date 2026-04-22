type TFunc = (key: string, vars?: Record<string, string | number>) => string

export function formatRelativeTime(
  dateString: string,
  t?: TFunc,
  locale: 'en' | 'zh' = 'zh'
): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then
  const diffMinutes = diffMs / (1000 * 60)
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffHours / 24

  if (t) {
    if (diffMinutes < 1) return t('relative_time.just_now')
    if (diffMinutes < 60) return t('relative_time.minutes_ago', { n: Math.floor(diffMinutes) })
    if (diffHours < 24) return t('relative_time.hours_ago', { n: Math.floor(diffHours) })
    if (diffDays < 7) return t('relative_time.days_ago', { n: Math.floor(diffDays) })
    if (diffDays < 30) return t('relative_time.weeks_ago', { n: Math.floor(diffDays / 7) })
    return new Date(dateString).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'numeric',
      day: 'numeric',
    })
  }

  if (diffHours < 1) return '刚刚更新'
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
  if (diffDays < 7) return `${Math.floor(diffDays)} 天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`
  return new Date(dateString).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'numeric',
    day: 'numeric',
  })
}

export function formatMinutesAgo(
  minutes: number,
  t: TFunc
): string {
  if (minutes < 1) return t('relative_time.just_now')
  if (minutes < 60) return t('relative_time.minutes_ago', { n: Math.floor(minutes) })
  const hours = minutes / 60
  if (hours < 24) return t('relative_time.hours_ago', { n: Math.floor(hours) })
  const days = hours / 24
  if (days < 7) return t('relative_time.days_ago', { n: Math.floor(days) })
  return t('relative_time.weeks_ago', { n: Math.floor(days / 7) })
}

export const STAGE_LABELS: Record<string, string> = {
  early: '前期',
  mid: '中期',
  late: '晚期',
  beyond: '超出历史上限',
  unknown: '',
}

export const STAGE_COLORS: Record<string, string> = {
  early: 'bg-emerald-400',
  mid: 'bg-blue-400',
  late: 'bg-amber-400',
  beyond: 'bg-red-400',
  unknown: 'bg-zinc-300',
}

export interface DifferenceSignal {
  key: 'extend' | 'shorten' | 'multi' | 'weak'
  icon: string
  color: string
}

export function calcDifferenceSignal(
  differences: { direction: string; confidence: string }[] | undefined
): DifferenceSignal | null {
  if (!differences || differences.length === 0) return null

  const highConf = differences.filter((d) => d.confidence === 'high')
  if (highConf.length === 0) return null

  const extendCount = highConf.filter(
    (d) => d.direction === 'may_extend' || d.direction === 'may_amplify'
  ).length
  const shortenCount = highConf.filter(
    (d) => d.direction === 'may_shorten' || d.direction === 'may_dampen'
  ).length

  if (extendCount >= 2 && shortenCount === 0) {
    return { key: 'extend', icon: '↑', color: 'text-emerald-600' }
  }
  if (shortenCount >= 2 && extendCount === 0) {
    return { key: 'shorten', icon: '↓', color: 'text-amber-600' }
  }
  if (highConf.length >= 3) {
    return { key: 'multi', icon: '⇅', color: 'text-blue-600' }
  }
  return { key: 'weak', icon: '·', color: 'text-zinc-500' }
}
