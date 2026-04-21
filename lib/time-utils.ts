export function getRelativeTime(dateStr: string, locale: 'en' | 'zh' = 'en'): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (locale === 'zh') {
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return `${Math.floor(days / 7)}w`
  }

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export function calcPlaybookStage(
  firstSeenAt: string,
  durationMin: number | null,
  durationMax: number | null
): 'early' | 'mid' | 'late' | 'beyond' | 'unknown' {
  if (!durationMin || !durationMax) return 'unknown'
  const daysActive = Math.floor((Date.now() - new Date(firstSeenAt).getTime()) / 86400000)
  const ceiling = durationMax
  const pct = daysActive / ceiling
  if (pct < 0.33) return 'early'
  if (pct < 0.66) return 'mid'
  if (pct < 1.0) return 'late'
  return 'beyond'
}
