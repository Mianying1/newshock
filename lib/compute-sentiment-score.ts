import { supabaseAdmin } from './supabase-admin'

const WINDOW_DAYS = 30
const HALF_LIFE_DAYS = 14
const RECENCY_SCALE = 3
const BULLISH_THRESHOLD = 3
const BEARISH_THRESHOLD = -3
const SHIFT_WINDOW_DAYS = 7
const SHIFT_TOP_N = 3

type Event = {
  id: string
  trigger_theme_id: string | null
  event_date: string
  headline: string
  supports_or_contradicts: string | null
  level_of_impact: string | null
}

type Theme = { id: string; name: string; status: string }

async function fetchAll<T>(table: string, cols: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    let q: any = supabaseAdmin.from(table).select(cols).range(from, from + PAGE - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as unknown as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function loiWeight(loi: string | null): number {
  if (loi === 'structure') return 3
  if (loi === 'subtheme') return 2
  if (loi === 'event_only') return 1
  return 1
}

export interface ComputeSentimentScoreStats {
  themes_updated: number
  distribution: Record<string, number>
}

export async function runComputeSentimentScore(): Promise<ComputeSentimentScoreStats> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400 * 1000).toISOString()

  const themes = await fetchAll<Theme>('themes', 'id, name, status')
  const activeThemes = themes.filter((t) => t.status === 'active')

  const events = await fetchAll<Event>(
    'events',
    'id, trigger_theme_id, event_date, headline, supports_or_contradicts, level_of_impact',
    (q) => q.gte('event_date', since).not('trigger_theme_id', 'is', null)
  )

  const byTheme = new Map<string, Event[]>()
  for (const e of events) {
    if (!e.trigger_theme_id) continue
    const arr = byTheme.get(e.trigger_theme_id) ?? []
    arr.push(e)
    byTheme.set(e.trigger_theme_id, arr)
  }

  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  const dist: Record<string, number> = { bullish: 0, mixed: 0, bearish: 0, neutral: 0 }
  let updated = 0

  for (const theme of activeThemes) {
    const evs = byTheme.get(theme.id) ?? []

    let bullScore = 0
    let bearScore = 0

    type Scored = { event: Event; direction: 'supports' | 'contradicts'; weight: number; daysAgo: number }
    const scored: Scored[] = []

    for (const e of evs) {
      const direction = e.supports_or_contradicts
      if (direction !== 'supports' && direction !== 'contradicts') continue

      const daysAgo = (now - new Date(e.event_date).getTime()) / (86400 * 1000)
      if (daysAgo < 0) continue
      const timeDecay = Math.exp(-daysAgo / HALF_LIFE_DAYS)
      const recencyBonus = 1 + 0.5 * Math.exp(-daysAgo / RECENCY_SCALE)
      const w = loiWeight(e.level_of_impact)

      if (direction === 'supports') {
        const contribution = w * timeDecay * recencyBonus
        bullScore += contribution
        scored.push({ event: e, direction: 'supports', weight: contribution, daysAgo })
      } else {
        const contribution = w * timeDecay
        bearScore += contribution
        scored.push({ event: e, direction: 'contradicts', weight: contribution, daysAgo })
      }
    }

    const sentiment = bullScore - bearScore
    const clamped = Math.max(-10, Math.min(10, sentiment))

    let dominant: string
    if (scored.length === 0) dominant = 'neutral'
    else if (sentiment > BULLISH_THRESHOLD) dominant = 'bullish'
    else if (sentiment < BEARISH_THRESHOLD) dominant = 'bearish'
    else dominant = 'mixed'
    dist[dominant]++

    const recentScored = scored.filter((s) => s.daysAgo <= SHIFT_WINDOW_DAYS).sort((a, b) => b.weight - a.weight).slice(0, SHIFT_TOP_N)
    let shiftDirection = 'none'
    if (recentScored.length > 0) {
      const recentBull = recentScored.filter((s) => s.direction === 'supports').reduce((a, s) => a + s.weight, 0)
      const recentBear = recentScored.filter((s) => s.direction === 'contradicts').reduce((a, s) => a + s.weight, 0)
      if (recentBull > recentBear * 1.2) shiftDirection = 'bull_absorbed_bear'
      else if (recentBear > recentBull * 1.2) shiftDirection = 'bear_outweighing_bull'
      else shiftDirection = 'balanced'
    }

    const recent_signal_shift = recentScored.length > 0 ? {
      last_shift_days_ago: Math.round(recentScored[0].daysAgo),
      direction: shiftDirection,
      key_events: recentScored.map((s) => ({
        title: s.event.headline.slice(0, 160),
        date: s.event.event_date,
        direction: s.direction,
        weight: Number(s.weight.toFixed(3)),
      })),
    } : null

    const { error } = await supabaseAdmin
      .from('themes')
      .update({
        sentiment_score: Number(clamped.toFixed(2)),
        sentiment_computed_at: nowIso,
        dominant_sentiment: dominant,
        recent_signal_shift,
      })
      .eq('id', theme.id)
    if (error) throw new Error(`update ${theme.id}: ${error.message}`)
    updated++
  }

  return { themes_updated: updated, distribution: dist }
}
