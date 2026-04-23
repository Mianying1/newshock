'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n-context'

interface ThemeAlertRow {
  id: string
  theme_id: string
  theme_name: string
  alert_type: string
  from_stage: string | null
  to_stage: string
  reason: string | null
  ratio: number | null
  days_since_first_event: number | null
  severity: 'info' | 'warn' | 'critical'
  seen_at: string | null
  created_at: string
}

interface AlertsResponse {
  alerts: ThemeAlertRow[]
  total: number
  unseen: number
  days: number
  updated_at: string
}

const SEVERITY_STYLE: Record<string, { bg: string; text: string; border: string; dot: string; labelKey: string }> = {
  critical: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    labelKey: 'stage_alerts.severity_critical',
  },
  warn: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    labelKey: 'stage_alerts.severity_warn',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    labelKey: 'stage_alerts.severity_info',
  },
}

function stageLabel(t: (k: string) => string, stage: string | null | undefined): string {
  if (!stage) return '-'
  return t(`stage_alerts.stage_${stage}`)
}

export default function StageAlertsSection() {
  const { t } = useI18n()
  const [data, setData] = useState<AlertsResponse | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [seenLocal, setSeenLocal] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch('/api/theme-alerts?days=7')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((d: AlertsResponse) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const markSeen = useCallback((id: string) => {
    setSeenLocal((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
    fetch(`/api/theme-alerts/${id}/seen`, { method: 'POST' }).catch(() => {
      // silent - UI already updated optimistically
    })
  }, [])

  if (loading) return null
  if (error) return null
  if (!data || data.alerts.length === 0) return null

  const unseenCount = data.alerts.filter((a) => a.seen_at === null && !seenLocal.has(a.id)).length

  return (
    <section className="my-6">
      <div className="sec-label">
        <span className="l">
          {t('stage_alerts.title')}
          {unseenCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-200 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {unseenCount}
            </span>
          )}
        </span>
        <span className="r">{t('stage_alerts.window_7d', { n: data.alerts.length })}</span>
      </div>
      <div className="space-y-2 mt-2">
        {data.alerts.slice(0, 8).map((alert) => {
          const locallySeen = seenLocal.has(alert.id)
          const isUnseen = alert.seen_at === null && !locallySeen
          const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info
          return (
            <div
              key={alert.id}
              className={`flex items-start gap-3 border rounded-lg p-3 ${style.border} ${style.bg}`}
            >
              <span className={`${style.dot} w-2 h-2 rounded-full mt-1.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${style.text} ${style.bg} border ${style.border} uppercase tracking-wide`}>
                    {t(style.labelKey)}
                  </span>
                  <Link
                    href={`/themes/${alert.theme_id}`}
                    className="font-medium text-sm text-zinc-900 hover:underline truncate"
                  >
                    {alert.theme_name}
                  </Link>
                  {isUnseen && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {t('stage_alerts.unseen')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-700 mt-1">
                  {stageLabel(t, alert.from_stage)} → <strong>{stageLabel(t, alert.to_stage)}</strong>
                  {alert.ratio !== null && (
                    <span className="text-zinc-500 ml-2">· ratio {alert.ratio.toFixed(2)}</span>
                  )}
                  {alert.days_since_first_event !== null && (
                    <span className="text-zinc-500 ml-2">· {alert.days_since_first_event}d</span>
                  )}
                </p>
                {alert.reason && (
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{alert.reason}</p>
                )}
              </div>
              {isUnseen && (
                <button
                  type="button"
                  onClick={() => markSeen(alert.id)}
                  className="text-xs text-zinc-500 hover:text-zinc-900 shrink-0 underline"
                >
                  {t('stage_alerts.mark_seen')}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
