'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface SuggestedArchetype {
  name: string
  name_zh: string
  category: string
  description: string
  description_zh: string
  priority: 'high' | 'medium' | 'low'
  reasoning: string
  suggested_tickers: string[]
  covers_unmatched_events?: string[]
  duration_type: 'extended' | 'bounded' | 'dependent'
}

interface SuggestedMerger {
  existing_archetype_ids: string[]
  proposed_umbrella_name: string
  proposed_umbrella_name_zh: string
  reasoning: string
}

interface SuggestedRebalancing {
  observation: string
  recommendation: string
}

interface AuditAction {
  type: string
  date: string
  payload?: Record<string, unknown>
}

interface AuditReport {
  id: string
  report_date: string
  active_archetype_count: number
  unmatched_events_count: number
  market_regime_label: string | null
  market_regime_score: number | null
  overall_assessment: string
  overall_assessment_zh: string
  suggested_new_archetypes: SuggestedArchetype[]
  suggested_mergers: SuggestedMerger[]
  suggested_rebalancing: SuggestedRebalancing[]
  actions_taken: AuditAction[]
  admin_reviewed_at: string | null
  admin_notes: string | null
  created_at: string
}

interface HistoryRow {
  id: string
  report_date: string
  active_archetype_count: number
  actions_taken: AuditAction[]
}

interface Response {
  latest: AuditReport | null
  history: HistoryRow[]
}

const priorityColor = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-zinc-50 text-zinc-600 border-zinc-200',
}

export default function CoverageAuditPage() {
  const { data, mutate, isLoading } = useSWR<Response>('/api/admin/coverage-audit', fetcher)
  const { locale } = useI18n()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (isLoading) {
    return <div className="p-8 text-zinc-500 text-sm">Loading…</div>
  }

  const latest = data?.latest ?? null
  const history = data?.history ?? []

  async function recordAction(
    key: string,
    reportId: string,
    action_type: AuditAction['type'],
    payload?: Record<string, unknown>
  ) {
    setBusy(key)
    try {
      const res = await fetch('/api/admin/coverage-audit/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId, action_type, payload }),
      })
      const result = await res.json()
      if (result.ok) {
        setMessage(`Action recorded: ${action_type}`)
        mutate()
      } else {
        setMessage(`Error: ${result.error ?? 'unknown'}`)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setBusy(null)
      setTimeout(() => setMessage(null), 5000)
    }
  }

  async function createArchetype(index: number, spec: SuggestedArchetype) {
    if (!latest) return
    const key = `create-${index}`
    setBusy(key)
    try {
      const slug = spec.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60)
      const res = await fetch('/api/admin/archetypes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slug,
          name: spec.name,
          category: spec.category,
          description: spec.description,
          trigger_keywords: [],
          typical_tickers: spec.suggested_tickers.map((s) => ({ symbol: s })),
          confidence_level: 'medium',
          notes: `Created from coverage audit ${latest.report_date}. Reasoning: ${spec.reasoning}`,
          spawn_theme: {
            name_zh: spec.name_zh,
            description_zh: spec.description_zh,
            priority: spec.priority,
            suggested_tickers: spec.suggested_tickers,
            covers_unmatched_events: spec.covers_unmatched_events ?? [],
            report_id: latest.id,
          },
        }),
      })
      const result = await res.json()
      if (res.ok && (result.ok || result.id)) {
        const themeBits: string[] = []
        if (result.theme_id) themeBits.push(`theme ${String(result.theme_id).slice(0, 8)}`)
        if (typeof result.recs_count === 'number') themeBits.push(`${result.recs_count} recs`)
        if (typeof result.events_linked === 'number' && result.events_linked > 0) {
          themeBits.push(`${result.events_linked} events linked`)
        }
        const failed: string[] = Array.isArray(result.failed_tickers) ? result.failed_tickers : []
        const failedSuffix = failed.length > 0 ? ` · skipped tickers: ${failed.join(', ')}` : ''
        const successMsg = themeBits.length > 0
          ? `Archetype + ${themeBits.join(', ')} created${failedSuffix}`
          : `Archetype created${result.spawn_error ? ` · spawn failed: ${result.spawn_error}` : ''}`
        await recordAction(key, latest.id, 'archetype_created', {
          index,
          archetype_id: result.id ?? slug,
          name: spec.name,
          theme_id: result.theme_id ?? null,
          recs_count: result.recs_count ?? null,
          events_linked: result.events_linked ?? null,
          failed_tickers: failed,
          spawn_error: result.spawn_error ?? null,
        })
        setMessage(successMsg)
        setTimeout(() => setMessage(null), 8000)
      } else {
        setMessage(`Create failed: ${result.error ?? `HTTP ${res.status}`}`)
        setTimeout(() => setMessage(null), 6000)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'network error'}`)
      setTimeout(() => setMessage(null), 6000)
    } finally {
      setBusy(null)
    }
  }

  if (!latest) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 min-h-screen">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-1">Coverage Audit</h1>
        <p className="text-sm text-zinc-500 mb-6">
          No audits yet. Run the first audit with{' '}
          <code className="bg-zinc-100 px-1.5 py-0.5 rounded">npx tsx scripts/run-coverage-audit.ts</code>.
        </p>
      </div>
    )
  }

  const actionsByKind = new Map<string, AuditAction[]>()
  for (const a of latest.actions_taken ?? []) {
    const arr = actionsByKind.get(a.type) ?? []
    arr.push(a)
    actionsByKind.set(a.type, arr)
  }

  function hasActionFor(kind: string, index: number): boolean {
    const list = actionsByKind.get(kind) ?? []
    return list.some((a) => (a.payload as { index?: number } | undefined)?.index === index)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-1">
          Coverage Audit · Week of {latest.report_date}
        </h1>
        <p className="text-sm text-zinc-500">
          Library: {latest.active_archetype_count} archetypes · Regime:{' '}
          {latest.market_regime_label ?? 'n/a'}
          {latest.market_regime_score != null && ` · ${latest.market_regime_score}/12`} ·{' '}
          Unmatched (14d): {latest.unmatched_events_count}
        </p>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-800">
          {message}
        </div>
      )}

      {/* Overall assessment */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-2">
          Overall Assessment
        </h2>
        <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-3">
          <p className="text-sm text-zinc-800 leading-relaxed">
            {pickField(locale, latest.overall_assessment, latest.overall_assessment_zh)}
          </p>
          {locale === 'zh' && latest.overall_assessment && (
            <p className="text-xs text-zinc-500 leading-relaxed pt-2 border-t border-zinc-100">
              {latest.overall_assessment}
            </p>
          )}
        </div>
      </section>

      {/* Suggested new archetypes */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-2">
          Suggested New Archetypes ({latest.suggested_new_archetypes.length})
        </h2>
        {latest.suggested_new_archetypes.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6">Library looks sufficient — no proposals.</p>
        ) : (
          <div className="space-y-3">
            {latest.suggested_new_archetypes.map((spec, i) => {
              const created = hasActionFor('archetype_created', i)
              const rejected = hasActionFor('archetype_rejected', i)
              const done = created || rejected
              return (
                <div
                  key={i}
                  className={`bg-white border rounded-lg p-5 ${
                    done ? 'border-zinc-100 opacity-60' : 'border-zinc-200'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${priorityColor[spec.priority] ?? priorityColor.low}`}
                        >
                          {spec.priority}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-zinc-600">
                          {spec.category}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-zinc-600">
                          {spec.duration_type}
                        </span>
                        {created && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                            ✅ Created
                          </span>
                        )}
                        {rejected && (
                          <span className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-500 border border-zinc-200 rounded">
                            Rejected
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-base leading-snug text-zinc-900">
                        {pickField(locale, spec.name, spec.name_zh)}
                      </h3>
                      {locale === 'zh' && spec.name && (
                        <div className="text-xs text-zinc-500 mt-0.5">{spec.name}</div>
                      )}
                    </div>
                    {!done && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => createArchetype(i, spec)}
                          disabled={busy !== null}
                          className="px-4 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                        >
                          {busy === `create-${i}` ? '…' : 'Create Archetype'}
                        </button>
                        <button
                          onClick={() =>
                            recordAction(`reject-${i}`, latest.id, 'archetype_rejected', {
                              index: i,
                              name: spec.name,
                            })
                          }
                          disabled={busy !== null}
                          className="px-4 py-1.5 bg-white border border-zinc-300 text-zinc-700 text-sm rounded hover:bg-zinc-50 disabled:opacity-40 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-zinc-700 leading-relaxed mb-3">
                    {pickField(locale, spec.description, spec.description_zh)}
                  </p>

                  <div className="text-xs text-zinc-500 leading-relaxed mb-3">
                    <span className="font-medium text-zinc-600">Why: </span>
                    {spec.reasoning}
                  </div>

                  {spec.suggested_tickers?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {spec.suggested_tickers.map((t) => (
                        <a
                          key={t}
                          href={`/tickers/${t}`}
                          className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-700 hover:bg-zinc-200"
                        >
                          ${t}
                        </a>
                      ))}
                    </div>
                  )}

                  {spec.covers_unmatched_events && spec.covers_unmatched_events.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                        Covers {spec.covers_unmatched_events.length} unmatched event(s)
                      </summary>
                      <ul className="text-xs text-zinc-500 mt-2 space-y-1">
                        {spec.covers_unmatched_events.map((id) => (
                          <li key={id} className="font-mono">
                            {id}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Suggested mergers */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-2">
          Suggested Mergers ({latest.suggested_mergers.length})
        </h2>
        {latest.suggested_mergers.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6">No merger candidates.</p>
        ) : (
          <div className="space-y-3">
            {latest.suggested_mergers.map((m, i) => {
              const approved = hasActionFor('merger_approved', i)
              const rejected = hasActionFor('merger_rejected', i)
              const done = approved || rejected
              return (
                <div
                  key={i}
                  className={`bg-white border rounded-lg p-5 ${
                    done ? 'border-zinc-100 opacity-60' : 'border-zinc-200'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-base text-zinc-900">
                        {pickField(locale, m.proposed_umbrella_name, m.proposed_umbrella_name_zh)}
                      </h3>
                      <div className="text-xs text-zinc-500 mt-1">
                        Merges:{' '}
                        {m.existing_archetype_ids.map((id, idx) => (
                          <span key={id}>
                            {idx > 0 && ' · '}
                            <code className="bg-zinc-100 px-1 py-0.5 rounded">{id}</code>
                          </span>
                        ))}
                      </div>
                    </div>
                    {!done && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() =>
                            recordAction(`merge-approve-${i}`, latest.id, 'merger_approved', {
                              index: i,
                              ...m,
                            })
                          }
                          disabled={busy !== null}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                        >
                          Approve Merge
                        </button>
                        <button
                          onClick={() =>
                            recordAction(`merge-reject-${i}`, latest.id, 'merger_rejected', {
                              index: i,
                            })
                          }
                          disabled={busy !== null}
                          className="px-3 py-1.5 bg-white border border-zinc-300 text-zinc-700 text-sm rounded hover:bg-zinc-50 disabled:opacity-40 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-zinc-700 leading-relaxed">{m.reasoning}</p>
                  {approved && (
                    <div className="mt-2 text-xs text-emerald-700">
                      ✅ Approved — apply merge manually in theme_archetypes.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Rebalancing notes */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-2">
          Rebalancing Notes ({latest.suggested_rebalancing.length})
        </h2>
        {latest.suggested_rebalancing.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6">No rebalancing notes.</p>
        ) : (
          <ul className="space-y-2">
            {latest.suggested_rebalancing.map((r, i) => (
              <li key={i} className="bg-white border border-zinc-200 rounded-lg p-4 text-sm">
                <div className="text-zinc-700 mb-1">
                  <span className="font-medium text-zinc-800">Observation: </span>
                  {r.observation}
                </div>
                <div className="text-zinc-700">
                  <span className="font-medium text-zinc-800">Recommendation: </span>
                  {r.recommendation}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Actions history */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-2">
          Audit History
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6">No prior audits.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((h) => {
              const counts = (h.actions_taken ?? []).reduce<Record<string, number>>((acc, a) => {
                acc[a.type] = (acc[a.type] ?? 0) + 1
                return acc
              }, {})
              return (
                <li
                  key={h.id}
                  className="flex items-center justify-between text-xs bg-white border border-zinc-200 rounded px-3 py-2"
                >
                  <span className="font-mono text-zinc-600">{h.report_date}</span>
                  <span className="text-zinc-500">
                    {h.active_archetype_count} archetypes ·{' '}
                    {Object.entries(counts)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ') || 'no actions'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
