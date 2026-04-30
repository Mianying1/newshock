export function calculateDaysAgo(date: string | Date): number {
  const then = typeof date === 'string' ? new Date(date) : date
  return Math.floor((Date.now() - then.getTime()) / 86400000)
}
