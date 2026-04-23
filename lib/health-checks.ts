import { supabaseAdmin } from './supabase-admin'

const DAY_MS = 86400000
const HOUR_MS = 3600000

export type HealthStatus = 'ok' | 'warn' | 'fail'

export interface HealthCheckResult<T = unknown> {
  id: string
  status: HealthStatus
  alerts: string[]
  data: T
}

function pct(n: number, d: number): number {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10
}

// ─── 1. Classifier errors (24h) ──────────────────────────────────────────────

export interface ClassifierErrorsData {
  total: number
  hourly: Array<[string, number]>
}

export async function checkClassifierErrors(): Promise<HealthCheckResult<ClassifierErrorsData>> {
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString()
  const { data } = await supabaseAdmin
    .from('events')
    .select('event_date, classifier_reasoning')
    .gte('event_date', since)
    .or('classifier_reasoning.ilike.%error%,classifier_reasoning.ilike.%401%,classifier_reasoning.ilike.%failed%')

  const byHour = new Map<string, number>()
  for (const e of (data ?? []) as { event_date: string | null }[]) {
    if (!e.event_date) continue
    const hour = e.event_date.slice(0, 13) + ':00'
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1)
  }
  const total = Array.from(byHour.values()).reduce((a, b) => a + b, 0)
  const hourly = Array.from(byHour.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 12)

  const alerts: string[] = []
  let status: HealthStatus = 'ok'
  if (total > 10) {
    alerts.push(`Classifier errors in 24h: ${total} (> 10)`)
    status = 'fail'
  } else if (total > 0) {
    status = 'warn'
  }
  return { id: 'classifier_errors', status, alerts, data: { total, hourly } }
}

// ─── 2-4. Field coverage (level_of_impact, supports_or_contradicts, exposure_type) ──

export interface CoverageFigure {
  filled: number
  total: number
}

function coverageStatus(c: CoverageFigure): HealthStatus {
  const nullPct = pct(c.total - c.filled, c.total)
  if (nullPct > 50) return 'fail'
  if (nullPct > 20) return 'warn'
  return 'ok'
}

export async function checkLevelOfImpactCoverage(): Promise<HealthCheckResult<CoverageFigure>> {
  const [eventsAll, eventsWithImpact] = await Promise.all([
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).not('level_of_impact', 'is', null),
  ])
  const data: CoverageFigure = { filled: eventsWithImpact.count ?? 0, total: eventsAll.count ?? 0 }
  const status = coverageStatus(data)
  const alerts = status === 'fail' ? [`events.level_of_impact NULL rate > 50%`] : []
  return { id: 'level_of_impact_coverage', status, alerts, data }
}

export async function checkCounterEvidenceCoverage(): Promise<
  HealthCheckResult<CoverageFigure & { all_events: number; supports: number; contradicts: number; neutral: number }>
> {
  const [total, allEvents, classified, sup, con, neu] = await Promise.all([
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).not('trigger_theme_id', 'is', null),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).not('supports_or_contradicts', 'is', null),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).eq('supports_or_contradicts', 'supports'),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).eq('supports_or_contradicts', 'contradicts'),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).eq('supports_or_contradicts', 'neutral'),
  ])
  const fig: CoverageFigure = { filled: classified.count ?? 0, total: total.count ?? 0 }
  const status = coverageStatus(fig)
  const alerts = status === 'fail' ? [`events.supports_or_contradicts NULL rate > 50%`] : []
  return {
    id: 'counter_evidence_coverage',
    status,
    alerts,
    data: {
      ...fig,
      all_events: allEvents.count ?? 0,
      supports: sup.count ?? 0,
      contradicts: con.count ?? 0,
      neutral: neu.count ?? 0,
    },
  }
}

export async function checkExposureTypeCoverage(): Promise<HealthCheckResult<CoverageFigure>> {
  const [recsAll, recsWithExposure] = await Promise.all([
    supabaseAdmin.from('theme_recommendations').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('theme_recommendations').select('id', { count: 'exact', head: true }).not('exposure_type', 'is', null),
  ])
  const data: CoverageFigure = { filled: recsWithExposure.count ?? 0, total: recsAll.count ?? 0 }
  const status = coverageStatus(data)
  const alerts = status === 'fail' ? [`theme_recommendations.exposure_type NULL rate > 50%`] : []
  return { id: 'exposure_type_coverage', status, alerts, data }
}

// ─── 5. Pipeline volume (24h / 7d) ───────────────────────────────────────────

export interface PipelineVolumeData {
  events: { d1: number; d7: number }
  themes: { d1: number; d7: number }
  counter_evidence: { d1: number; d7: number }
}

export async function checkPipelineVolume(): Promise<HealthCheckResult<PipelineVolumeData>> {
  const since24h = new Date(Date.now() - 24 * HOUR_MS).toISOString()
  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString()

  const [ev24, ev7d, themes24, themes7d, ce24, ce7d] = await Promise.all([
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).gte('created_at', since7d),
    supabaseAdmin.from('themes').select('id', { count: 'exact', head: true }).gte('created_at', since24h).in('status', ['active', 'exploratory']),
    supabaseAdmin.from('themes').select('id', { count: 'exact', head: true }).gte('created_at', since7d).in('status', ['active', 'exploratory']),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).not('supports_or_contradicts', 'is', null).gte('created_at', since24h),
    supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).not('supports_or_contradicts', 'is', null).gte('created_at', since7d),
  ])

  const data: PipelineVolumeData = {
    events: { d1: ev24.count ?? 0, d7: ev7d.count ?? 0 },
    themes: { d1: themes24.count ?? 0, d7: themes7d.count ?? 0 },
    counter_evidence: { d1: ce24.count ?? 0, d7: ce7d.count ?? 0 },
  }
  // Volume is informational — no auto alerts; ingest staleness is detected by cron check.
  return { id: 'pipeline_volume', status: 'ok', alerts: [], data }
}

// ─── 6. Cron status (per-path proxy + grace-based stale) ─────────────────────

export interface CronEntry {
  path: string
  schedule: string
}

export interface CronCheckRow {
  path: string
  schedule: string
  last_run_iso: string | null
  proxy_label: string
  stale: boolean
}

function parseCronField(field: string, min: number, max: number): Set<number> {
  if (field === '*') {
    const s = new Set<number>()
    for (let i = min; i <= max; i++) s.add(i)
    return s
  }
  const values = new Set<number>()
  for (const part of field.split(',')) {
    const dash = part.match(/^(\d+)-(\d+)$/)
    if (dash) {
      const lo = parseInt(dash[1], 10)
      const hi = parseInt(dash[2], 10)
      for (let i = lo; i <= hi; i++) values.add(i)
    } else {
      values.add(parseInt(part, 10))
    }
  }
  return values
}

// Minimal cron parser: supports `min hour dom mon dow` with '*', single values,
// comma lists, and `a-b` ranges. Steps forward minute-by-minute from `afterMs`
// (exclusive) until all fields match. Caps at 14 days. Sufficient for our
// vercel.json schedules (no step or named-day syntax).
function nextTriggerAfter(schedule: string, afterMs: number): number {
  const parts = schedule.split(/\s+/)
  if (parts.length < 5) return afterMs + 14 * DAY_MS
  const mins = parseCronField(parts[0], 0, 59)
  const hours = parseCronField(parts[1], 0, 23)
  const dows = parseCronField(parts[4], 0, 6)
  const startMin = Math.floor(afterMs / 60000) + 1
  const cap = 14 * 24 * 60
  for (let i = 0; i < cap; i++) {
    const t = new Date((startMin + i) * 60000)
    if (mins.has(t.getUTCMinutes()) && hours.has(t.getUTCHours()) && dows.has(t.getUTCDay())) {
      return t.getTime()
    }
  }
  return afterMs + 14 * DAY_MS
}

export async function checkCronStatus(crons: CronEntry[]): Promise<HealthCheckResult<CronCheckRow[]>> {
  const uniquePaths = Array.from(new Set(crons.map((c) => c.path)))

  const [events, narratives, candidates, regime, audit, deepThemes, convictionThemes, counterEvEvents, themesUpdated] = await Promise.all([
    supabaseAdmin.from('events').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('market_narratives').select('generated_at').order('generated_at', { ascending: false }).limit(1),
    supabaseAdmin.from('archetype_candidates').select('scan_date').order('scan_date', { ascending: false }).limit(1),
    supabaseAdmin.from('market_regime_snapshots').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('coverage_audit_reports').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('themes').select('deep_generated_at').order('deep_generated_at', { ascending: false, nullsFirst: false }).limit(1),
    supabaseAdmin.from('themes').select('conviction_generated_at').order('conviction_generated_at', { ascending: false, nullsFirst: false }).limit(1),
    supabaseAdmin.from('events').select('created_at').not('supports_or_contradicts', 'is', null).order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('themes').select('updated_at').order('updated_at', { ascending: false }).limit(1),
  ])

  const proxyByPrefix: Array<{ prefix: string; iso: string | null; label: string }> = [
    { prefix: '/api/cron/ingest', iso: events.data?.[0]?.created_at ?? null, label: 'max(events.created_at)' },
    { prefix: '/api/cron/generate-narratives', iso: narratives.data?.[0]?.generated_at ?? null, label: 'max(market_narratives.generated_at)' },
    { prefix: '/api/cron/weekly-scan', iso: candidates.data?.[0]?.scan_date ?? null, label: 'max(archetype_candidates.scan_date)' },
    { prefix: '/api/cron/theme-cooling', iso: themesUpdated.data?.[0]?.updated_at ?? null, label: 'max(themes.updated_at)' },
    { prefix: '/api/cron/market-regime', iso: regime.data?.[0]?.created_at ?? null, label: 'max(market_regime_snapshots.created_at)' },
    { prefix: '/api/cron/coverage-audit', iso: audit.data?.[0]?.created_at ?? null, label: 'max(coverage_audit_reports.created_at)' },
    { prefix: '/api/cron/refresh-deep-recommendations', iso: deepThemes.data?.[0]?.deep_generated_at ?? null, label: 'max(themes.deep_generated_at)' },
    { prefix: '/api/cron/conviction', iso: convictionThemes.data?.[0]?.conviction_generated_at ?? null, label: 'max(themes.conviction_generated_at)' },
    { prefix: '/api/cron/counter-evidence', iso: counterEvEvents.data?.[0]?.created_at ?? null, label: 'max(events.created_at where supports_or_contradicts NOT NULL)' },
  ]

  const rows: CronCheckRow[] = uniquePaths.map((path) => {
    const sched = crons.find((c) => c.path === path)?.schedule ?? ''
    const proxy = proxyByPrefix.find((p) => path.startsWith(p.prefix))
    const iso = proxy?.iso ?? null
    const label = proxy?.label ?? '(no proxy)'
    let stale = false
    if (iso && sched) {
      const lastMs = new Date(iso).getTime()
      const expectedNext = nextTriggerAfter(sched, lastMs)
      stale = Date.now() > expectedNext + HOUR_MS
    } else if (!iso && proxy) {
      stale = true
    }
    return { path, schedule: sched, last_run_iso: iso, proxy_label: label, stale }
  })

  const alerts: string[] = []
  for (const r of rows) {
    if (r.stale && r.last_run_iso) alerts.push(`Cron stale · ${r.path} · last run ${r.last_run_iso}`)
    if (r.stale && !r.last_run_iso && r.proxy_label !== '(no proxy)') alerts.push(`Cron proxy empty · ${r.path}`)
  }
  const status: HealthStatus = alerts.length > 0 ? 'fail' : 'ok'
  return { id: 'cron_status', status, alerts, data: rows }
}

// ─── 7. Conviction coverage (active themes only · design A) ──────────────────

export interface ConvictionCoverageData {
  total: number
  scored: number
  last: string | null
}

export async function checkConvictionCoverage(): Promise<HealthCheckResult<ConvictionCoverageData>> {
  const [all, scored, recent] = await Promise.all([
    supabaseAdmin.from('themes').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseAdmin.from('themes').select('id', { count: 'exact', head: true }).eq('status', 'active').not('conviction_score', 'is', null),
    supabaseAdmin.from('themes').select('conviction_generated_at').eq('status', 'active').not('conviction_generated_at', 'is', null).order('conviction_generated_at', { ascending: false }).limit(1),
  ])
  const total = all.count ?? 0
  const scoredCount = scored.count ?? 0
  const alerts: string[] = []
  let status: HealthStatus = 'ok'
  if (scoredCount === 0 && total > 0) {
    alerts.push(`Conviction: 0 themes scored`)
    status = 'fail'
  } else if (scoredCount < total) {
    status = 'warn'
  }
  return {
    id: 'conviction_coverage',
    status,
    alerts,
    data: { total, scored: scoredCount, last: recent.data?.[0]?.conviction_generated_at ?? null },
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface ThemeAlerts24hData {
  total: number
  critical: number
  warn: number
  info: number
  since: string
}

export async function checkThemeAlerts24h(): Promise<HealthCheckResult<ThemeAlerts24hData>> {
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString()
  const { data, error } = await supabaseAdmin
    .from('theme_alerts')
    .select('severity')
    .gte('created_at', since)

  if (error) {
    return {
      id: 'theme_alerts_24h',
      status: 'warn',
      alerts: [`theme_alerts query failed: ${error.message}`],
      data: { total: 0, critical: 0, warn: 0, info: 0, since },
    }
  }

  const counts = { critical: 0, warn: 0, info: 0 }
  for (const r of (data ?? []) as { severity: string | null }[]) {
    const s = r.severity ?? 'info'
    if (s === 'critical' || s === 'warn' || s === 'info') counts[s as keyof typeof counts]++
  }
  const total = counts.critical + counts.warn + counts.info
  const alerts: string[] = []
  let status: HealthStatus = 'ok'
  if (counts.critical > 0) {
    alerts.push(`${counts.critical} critical theme_alert(s) in 24h`)
    status = 'fail'
  } else if (counts.warn > 0) {
    status = 'warn'
  }
  return { id: 'theme_alerts_24h', status, alerts, data: { total, ...counts, since } }
}

export interface SentimentShiftRow {
  theme_id: string
  theme_name: string
  sentiment_score: number | null
  dominant_sentiment: string | null
  direction: string | null
  last_shift_days_ago: number | null
  computed_at: string | null
}

export interface SentimentShifts7dData {
  rows: SentimentShiftRow[]
  since: string
}

export async function checkSentimentShifts7d(): Promise<HealthCheckResult<SentimentShifts7dData>> {
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, sentiment_score, dominant_sentiment, recent_signal_shift, sentiment_computed_at')
    .gte('sentiment_computed_at', since)
    .not('recent_signal_shift', 'is', null)
    .limit(200)

  if (error) {
    return {
      id: 'sentiment_shifts_7d',
      status: 'warn',
      alerts: [`sentiment query failed: ${error.message}`],
      data: { rows: [], since },
    }
  }

  type RawShift = { direction?: string; last_shift_days_ago?: number } | null
  const rows: SentimentShiftRow[] = (data ?? [])
    .map((r) => {
      const shift = r.recent_signal_shift as RawShift
      return {
        theme_id: r.id as string,
        theme_name: r.name as string,
        sentiment_score: r.sentiment_score === null || r.sentiment_score === undefined
          ? null
          : Number(r.sentiment_score),
        dominant_sentiment: (r.dominant_sentiment as string | null) ?? null,
        direction: shift?.direction ?? null,
        last_shift_days_ago: shift?.last_shift_days_ago ?? null,
        computed_at: (r.sentiment_computed_at as string | null) ?? null,
      }
    })
    .filter((r) => r.direction && r.direction !== 'balanced' && r.direction !== 'none')
    .sort((a, b) => Math.abs(b.sentiment_score ?? 0) - Math.abs(a.sentiment_score ?? 0))
    .slice(0, 5)

  return {
    id: 'sentiment_shifts_7d',
    status: 'ok',
    alerts: [],
    data: { rows, since },
  }
}

export interface AllHealthChecks {
  classifierErrors: HealthCheckResult<ClassifierErrorsData>
  levelOfImpact: HealthCheckResult<CoverageFigure>
  counterEvidence: HealthCheckResult<
    CoverageFigure & { all_events: number; supports: number; contradicts: number; neutral: number }
  >
  exposureType: HealthCheckResult<CoverageFigure>
  pipelineVolume: HealthCheckResult<PipelineVolumeData>
  cronStatus: HealthCheckResult<CronCheckRow[]>
  convictionCoverage: HealthCheckResult<ConvictionCoverageData>
  themeAlerts24h: HealthCheckResult<ThemeAlerts24hData>
  sentimentShifts7d: HealthCheckResult<SentimentShifts7dData>
  alerts: string[]
  anyFail: boolean
}

export async function runAllHealthChecks(crons: CronEntry[]): Promise<AllHealthChecks> {
  const [
    classifierErrors,
    levelOfImpact,
    counterEvidence,
    exposureType,
    pipelineVolume,
    cronStatus,
    convictionCoverage,
    themeAlerts24h,
    sentimentShifts7d,
  ] = await Promise.all([
    checkClassifierErrors(),
    checkLevelOfImpactCoverage(),
    checkCounterEvidenceCoverage(),
    checkExposureTypeCoverage(),
    checkPipelineVolume(),
    checkCronStatus(crons),
    checkConvictionCoverage(),
    checkThemeAlerts24h(),
    checkSentimentShifts7d(),
  ])

  const all = [
    classifierErrors,
    levelOfImpact,
    counterEvidence,
    exposureType,
    pipelineVolume,
    cronStatus,
    convictionCoverage,
    themeAlerts24h,
    sentimentShifts7d,
  ]
  const alerts = all.flatMap((r) => r.alerts)
  const anyFail = all.some((r) => r.status === 'fail')

  return {
    classifierErrors,
    levelOfImpact,
    counterEvidence,
    exposureType,
    pipelineVolume,
    cronStatus,
    convictionCoverage,
    themeAlerts24h,
    sentimentShifts7d,
    alerts,
    anyFail,
  }
}
