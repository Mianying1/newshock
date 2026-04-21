export function formatAwarenessLabel(level: string): string {
  const map: Record<string, string> = {
    hidden: '隐匿期 (Hidden)',
    early: '早期信号 (Early)',
    rising: '上升中 (Rising)',
    mainstream: '主流关注 (Mainstream)',
    overheated: '过热 (Overheated)',
  }
  return map[level] ?? level
}

export function formatCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    geopolitical: '地缘政治',
    macro_monetary: '宏观货币',
    ai_semi: 'AI / 半导体',
    supply_chain: '供应链',
    tech_breakthrough: '技术突破',
    earnings: '财报确认',
    disaster: '灾害事故',
  }
  return map[category] ?? category
}

export function calculateDaysAgo(date: string | Date): number {
  const then = typeof date === 'string' ? new Date(date) : date
  return Math.floor((Date.now() - then.getTime()) / 86400000)
}
