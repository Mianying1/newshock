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
