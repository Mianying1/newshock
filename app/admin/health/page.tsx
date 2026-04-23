import Link from 'next/link'
import vercelConfig from '@/vercel.json'
import { runAllHealthChecks, type CronEntry } from '@/lib/health-checks'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DAY_MS = 86400000
const HOUR_MS = 3600000

function pct(n: number, d: number): number {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10
}

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < HOUR_MS) return `${Math.round(ms / 60000)}m ago`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h ago`
  return `${Math.round(ms / DAY_MS)}d ago`
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'fail' | 'info'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : tone === 'fail'
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-zinc-50 text-zinc-700 border-zinc-200'
  return <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>
}

function CoverageBar({ label, filled, total }: { label: string; filled: number; total: number }) {
  const nullCount = total - filled
  const nullPct = pct(nullCount, total)
  const fillPct = 100 - nullPct
  const barColor = fillPct < 50 ? 'bg-rose-500' : fillPct < 80 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-zinc-700">{label}</span>
        <span className="tabular-nums text-zinc-500">
          {filled}/{total} · NULL {nullPct}%
        </span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  )
}

export default async function AdminHealthPage() {
  const crons = (vercelConfig as { crons: CronEntry[] }).crons
  const health = await runAllHealthChecks(crons)

  const errors = health.classifierErrors.data
  const coverage = {
    level_of_impact: health.levelOfImpact.data,
    supports_or_contradicts: { filled: health.counterEvidence.data.filled, total: health.counterEvidence.data.total },
    exposure_type: health.exposureType.data,
  }
  const volume = health.pipelineVolume.data
  const cronStatus = health.cronStatus.data
  const conviction = health.convictionCoverage.data
  const counter = health.counterEvidence.data
  const alerts = health.alerts

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Health Dashboard</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Server-rendered · {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC</p>
          </div>
          <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-900">
            ← Admin
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* 1. Alerts */}
        <section className="border border-zinc-200 bg-white rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2">
            1 · Alerts{' '}
            {alerts.length === 0 ? <Badge tone="ok">✓ all clear</Badge> : <Badge tone="fail">{alerts.length} firing</Badge>}
          </h2>
          {alerts.length === 0 ? (
            <p className="text-xs text-zinc-500">No thresholds breached.</p>
          ) : (
            <ul className="text-xs text-zinc-800 space-y-1">
              {alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-rose-600">⚠</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2. Classifier Errors (24h) */}
        <section className="border border-zinc-200 bg-white rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2">
            2 · Classifier Errors (24h){' '}
            {errors.total === 0 ? (
              <Badge tone="ok">0</Badge>
            ) : errors.total > 10 ? (
              <Badge tone="fail">{errors.total}</Badge>
            ) : (
              <Badge tone="warn">{errors.total}</Badge>
            )}
          </h2>
          {errors.hourly.length === 0 ? (
            <p className="text-xs text-zinc-500">No classifier errors in last 24h.</p>
          ) : (
            <table className="text-xs w-full">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="font-normal pb-1">Hour (UTC)</th>
                  <th className="font-normal pb-1 text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {errors.hourly.map(([hour, count]) => (
                  <tr key={hour} className="border-t border-zinc-100">
                    <td className="py-1 font-mono text-zinc-700">{hour}</td>
                    <td className="py-1 text-right tabular-nums">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* 3. Field Coverage */}
        <section className="border border-zinc-200 bg-white rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">3 · Field Coverage</h2>
          <div className="space-y-3">
            <CoverageBar
              label="events.level_of_impact"
              filled={coverage.level_of_impact.filled}
              total={coverage.level_of_impact.total}
            />
            <CoverageBar
              label="events.supports_or_contradicts (of events with theme)"
              filled={coverage.supports_or_contradicts.filled}
              total={coverage.supports_or_contradicts.total}
            />
            <CoverageBar
              label="theme_recommendations.exposure_type"
              filled={coverage.exposure_type.filled}
              total={coverage.exposure_type.total}
            />
          </div>
        </section>

        {/* 4. Pipeline Volume */}
        <section className="border border-zinc-200 bg-white rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">4 · Pipeline Volume</h2>
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="font-normal pb-1">Metric</th>
                <th className="font-normal pb-1 text-right">24h</th>
                <th className="font-normal pb-1 text-right">7d</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-100">
                <td className="py-1">events ingested</td>
                <td className="py-1 text-right tabular-nums">{volume.events.d1}</td>
                <td className="py-1 text-right tabular-nums">{volume.events.d7}</td>
              </tr>
              <tr className="border-t border-zinc-100">
                <td className="py-1">themes created (active/exploratory)</td>
                <td className="py-1 text-right tabular-nums">{volume.themes.d1}</td>
                <td className="py-1 text-right tabular-nums">{volume.themes.d7}</td>
              </tr>
              <tr className="border-t border-zinc-100">
                <td className="py-1">counter-evidence (events w/ classification)</td>
                <td className="py-1 text-right tabular-nums">{volume.counter_evidence.d1}</td>
                <td className="py-1 text-right tabular-nums">{volume.counter_evidence.d7}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 5. Cron Status */}
        <section className="border border-zinc-200 bg-white rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">5 · Cron Status</h2>
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="font-normal pb-1">Path</th>
                <th className="font-normal pb-1">Schedule</th>
                <th className="font-normal pb-1">Last run (proxy)</th>
                <th className="font-normal pb-1 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {cronStatus.map((c) => (
                <tr key={c.path} className="border-t border-zinc-100">
                  <td className="py-1 font-mono text-zinc-700 text-[11px]">{c.path}</td>
                  <td className="py-1 font-mono text-zinc-500 text-[11px]">{c.schedule}</td>
                  <td className="py-1 text-zinc-600">
                    <span title={c.proxy_label}>{relTime(c.last_run_iso)}</span>
                  </td>
                  <td className="py-1 text-right">
                    {c.proxy_label === '(no proxy)' ? (
                      <Badge tone="info">? no proxy</Badge>
                    ) : c.stale ? (
                      <Badge tone="fail">✗ stale</Badge>
                    ) : c.last_run_iso ? (
                      <Badge tone="ok">✓ ok</Badge>
                    ) : (
                      <Badge tone="warn">⚠ empty</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 6. Conviction Coverage */}
        <section className="border border-zinc-200 bg-white rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2">
            6 · Conviction Coverage{' '}
            {conviction.total && conviction.scored === conviction.total ? (
              <Badge tone="ok">{conviction.scored}/{conviction.total}</Badge>
            ) : conviction.scored === 0 ? (
              <Badge tone="fail">0/{conviction.total}</Badge>
            ) : (
              <Badge tone="warn">{conviction.scored}/{conviction.total}</Badge>
            )}
          </h2>
          <div className="text-xs text-zinc-600 space-y-0.5">
            <div>
              Scored: <span className="tabular-nums">{conviction.scored}</span> / {conviction.total} active themes ({pct(conviction.scored, conviction.total)}%)
            </div>
            <div>Most recent: {relTime(conviction.last)}</div>
            <div className="text-[11px] text-zinc-500 pt-1">
              Scope: status=&apos;active&apos; only (design A) · exploratory/cooling/archived themes are not scored.
            </div>
          </div>
        </section>

        {/* 7. Counter-Evidence Coverage */}
        <section className="border border-zinc-200 bg-white rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2">
            7 · Counter-Evidence Coverage{' '}
            <Badge tone={counter.filled === counter.total ? 'ok' : 'warn'}>
              {counter.filled}/{counter.total}
            </Badge>
          </h2>
          <div className="text-xs text-zinc-600 space-y-1">
            <div>
              Classified: <span className="tabular-nums">{counter.filled}</span> / {counter.total} events with theme ({pct(counter.filled, counter.total)}%)
            </div>
            <div className="text-[11px] text-zinc-500">
              Denominator = events with trigger_theme_id ({counter.total}) · not all events ({counter.all_events}).
            </div>
            <div className="flex gap-4 pt-1">
              <span>
                <span className="text-emerald-700">↑ supports</span>:{' '}
                <span className="tabular-nums">{counter.supports}</span>
              </span>
              <span>
                <span className="text-rose-700">↓ contradicts</span>:{' '}
                <span className="tabular-nums">{counter.contradicts}</span>
              </span>
              <span>
                <span className="text-zinc-600">· neutral</span>:{' '}
                <span className="tabular-nums">{counter.neutral}</span>
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
