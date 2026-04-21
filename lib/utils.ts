export function formatRelativeTime(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffHours / 24

  if (diffHours < 1) return '刚刚更新'
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
  if (diffDays < 7) return `${Math.floor(diffDays)} 天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`
  return new Date(dateString).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
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
