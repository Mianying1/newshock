import { supabaseAdmin } from '@/lib/supabase-admin'

export type TriggerRuleType = 'event_count' | 'stale' | 'manual_review'
export type TriggerStatus = 'not_triggered' | 'triggered' | 'manual_review'

export interface ExitSignalTriggerRow {
  theme_id: string
  archetype_id: string
  signal_index: number
  signal_text: string
  trigger_rule_type: TriggerRuleType
  trigger_status: TriggerStatus
  triggered_at: string | null
  triggered_evidence: Record<string, unknown> | null
  last_checked_at: string
}

const EVENT_COUNT_THRESHOLD = 3
const STALE_DAYS = 30
const EVENT_WINDOW_DAYS = 30

// Keywords that indicate a signal is quantifiable from the events table.
// We check both EN and ZH wordings (signals are author-written, mixed-language).
const EVENT_COUNT_KEYWORDS = [
  'contradict', 'contradicts', 'contradiction',
  'reversal', 'reverse', 'reversing',
  'negative', 'bearish',
  'failure', 'failed', 'failing', 'fails', 'fail',
  'downgrade', 'downgrades', 'downgraded',
  'cancel', 'canceled', 'cancellation',
  'shutdown', 'closures', 'shutting',
  'guidance cut', 'cut guidance', 'lower guidance',
  '反转', '逆转', '失败', '取消', '下调', '负面', '看空', '退出', '抛售',
]

const STALE_KEYWORDS = [
  'stale', 'no news', 'no new', 'silence', 'inactive', 'dormant',
  'absence of', 'lack of catalyst', 'lack of', 'no catalyst',
  '停滞', '无新闻', '沉寂', '无催化', '失活', '冷却',
]

export function classifySignal(signalText: string): TriggerRuleType {
  const lower = signalText.toLowerCase()
  if (STALE_KEYWORDS.some(k => lower.includes(k))) return 'stale'
  if (EVENT_COUNT_KEYWORDS.some(k => lower.includes(k))) return 'event_count'
  return 'manual_review'
}

interface EventRow {
  id: string
  event_date: string | null
  headline: string
  short_headline: string | null
  short_headline_zh: string | null
  supports_or_contradicts: string | null
}

async function fetchThemeEvents(themeId: string, sinceIso: string): Promise<EventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id, event_date, headline, short_headline, short_headline_zh, supports_or_contradicts')
    .eq('trigger_theme_id', themeId)
    .gte('event_date', sinceIso)
    .order('event_date', { ascending: false })
  if (error) throw new Error(`fetch events for ${themeId}: ${error.message}`)
  return (data ?? []) as EventRow[]
}

async function fetchAllThemeEvents(themeId: string): Promise<EventRow[]> {
  // For 'stale' rule we need to know if any event exists at all in the window.
  const cutoffIso = new Date(Date.now() - STALE_DAYS * 86400 * 1000).toISOString()
  return fetchThemeEvents(themeId, cutoffIso)
}

export interface DetectionInput {
  themeId: string
  archetypeId: string
  signals: string[]
}

export async function detectForTheme(input: DetectionInput): Promise<ExitSignalTriggerRow[]> {
  const now = new Date()
  const nowIso = now.toISOString()
  const windowIso = new Date(now.getTime() - EVENT_WINDOW_DAYS * 86400 * 1000).toISOString()

  let cachedEvents: EventRow[] | null = null
  const loadEvents = async (): Promise<EventRow[]> => {
    if (cachedEvents) return cachedEvents
    cachedEvents = await fetchThemeEvents(input.themeId, windowIso)
    return cachedEvents
  }

  const rows: ExitSignalTriggerRow[] = []
  for (let i = 0; i < input.signals.length; i++) {
    const text = input.signals[i]
    const ruleType = classifySignal(text)

    let status: TriggerStatus = 'not_triggered'
    let triggeredAt: string | null = null
    let evidence: Record<string, unknown> | null = null

    if (ruleType === 'manual_review') {
      status = 'manual_review'
    } else if (ruleType === 'stale') {
      const events = await loadEvents()
      if (events.length === 0) {
        status = 'triggered'
        triggeredAt = nowIso
        evidence = { reason: 'no events in last 30 days', window_days: STALE_DAYS, event_count: 0 }
      } else {
        evidence = { event_count: events.length, window_days: STALE_DAYS }
      }
    } else if (ruleType === 'event_count') {
      const events = await loadEvents()
      const contradicts = events.filter(e => e.supports_or_contradicts === 'contradicts')
      if (contradicts.length >= EVENT_COUNT_THRESHOLD) {
        status = 'triggered'
        triggeredAt = nowIso
        evidence = {
          threshold: EVENT_COUNT_THRESHOLD,
          window_days: EVENT_WINDOW_DAYS,
          contradicts_count: contradicts.length,
          examples: contradicts.slice(0, 3).map(e => ({
            id: e.id,
            event_date: e.event_date,
            headline: e.short_headline_zh ?? e.short_headline ?? e.headline,
          })),
        }
      } else {
        evidence = {
          threshold: EVENT_COUNT_THRESHOLD,
          window_days: EVENT_WINDOW_DAYS,
          contradicts_count: contradicts.length,
        }
      }
    }

    rows.push({
      theme_id: input.themeId,
      archetype_id: input.archetypeId,
      signal_index: i,
      signal_text: text,
      trigger_rule_type: ruleType,
      trigger_status: status,
      triggered_at: triggeredAt,
      triggered_evidence: evidence,
      last_checked_at: nowIso,
    })
  }
  return rows
}

export async function upsertTriggerRows(rows: ExitSignalTriggerRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabaseAdmin
    .from('theme_exit_signal_triggers')
    .upsert(rows, { onConflict: 'theme_id,signal_index' })
  if (error) throw new Error(`upsert triggers: ${error.message}`)
}

export interface RunStats {
  themes_processed: number
  themes_failed: number
  signals_total: number
  by_rule: Record<TriggerRuleType, number>
  by_status: Record<TriggerStatus, number>
  failures: { theme_id: string; error: string }[]
}

interface ThemeForDetection {
  id: string
  archetype_id: string
  exit_signals: string[]
}

// exit_signals comes in two shapes across archetypes:
//   1. plain strings: ["text1", "text2"]
//   2. objects: [{ signal: "...", description: "..." }]
// Normalize to a flat string so the detector and UI both see one shape.
function normalizeSignal(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const r = raw as { signal?: unknown; description?: unknown; text?: unknown }
    const parts: string[] = []
    if (typeof r.signal === 'string') parts.push(r.signal)
    if (typeof r.description === 'string') parts.push(r.description)
    if (parts.length === 0 && typeof r.text === 'string') parts.push(r.text)
    return parts.length > 0 ? parts.join(' · ') : null
  }
  return null
}

async function fetchActiveThemesWithSignals(): Promise<ThemeForDetection[]> {
  // Read archetype.playbook.exit_signals for each active theme.
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('id, archetype_id, theme_archetypes!inner(id, playbook)')
    .eq('status', 'active')
  if (error) throw new Error(`fetch themes: ${error.message}`)

  type Row = {
    id: string
    archetype_id: string
    theme_archetypes: { id: string; playbook: { exit_signals?: unknown[] } | null } | null
  }
  const out: ThemeForDetection[] = []
  for (const r of (data ?? []) as unknown as Row[]) {
    const raw = r.theme_archetypes?.playbook?.exit_signals ?? []
    if (!Array.isArray(raw) || raw.length === 0) continue
    const signals = raw.map(normalizeSignal).filter((s): s is string => !!s && s.length > 0)
    if (signals.length === 0) continue
    out.push({ id: r.id, archetype_id: r.archetype_id, exit_signals: signals })
  }
  return out
}

export async function runExitSignalDetection(themeIds?: string[]): Promise<RunStats> {
  const all = await fetchActiveThemesWithSignals()
  const themes = themeIds ? all.filter(t => themeIds.includes(t.id)) : all

  const stats: RunStats = {
    themes_processed: 0,
    themes_failed: 0,
    signals_total: 0,
    by_rule: { event_count: 0, stale: 0, manual_review: 0 },
    by_status: { not_triggered: 0, triggered: 0, manual_review: 0 },
    failures: [],
  }

  for (const t of themes) {
    try {
      const rows = await detectForTheme({
        themeId: t.id,
        archetypeId: t.archetype_id,
        signals: t.exit_signals,
      })
      await upsertTriggerRows(rows)
      stats.themes_processed++
      stats.signals_total += rows.length
      for (const row of rows) {
        stats.by_rule[row.trigger_rule_type]++
        stats.by_status[row.trigger_status]++
      }
    } catch (e) {
      stats.themes_failed++
      stats.failures.push({ theme_id: t.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return stats
}
