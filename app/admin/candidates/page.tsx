'use client'
import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Ticker { symbol: string; reasoning?: string }
interface SimilarityWarning {
  type: 'vs_existing' | 'vs_candidate'
  target_id: string
  target_name: string
  similarity_score: number
  reason: string
  recommendation: string
}
interface Candidate {
  id: string
  proposed_archetype_id: string
  title: string
  category: string
  description: string
  initial_tickers: Ticker[]
  recent_events: string[]
  why_this_matters: string | null
  estimated_importance: 'high' | 'medium' | 'low'
  scan_date: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  theme_group: string | null
  similarity_warnings: SimilarityWarning[] | null
}

export default function CandidatesPage() {
  const { data, mutate, isLoading } = useSWR('/api/admin/candidates', fetcher)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const candidates: Candidate[] = data?.candidates ?? []
  const byStatus = {
    pending: candidates.filter((c) => c.status === 'pending'),
    approved: candidates.filter((c) => c.status === 'approved'),
    rejected: candidates.filter((c) => c.status === 'rejected'),
  }
  const filtered = byStatus[filter]

  const grouped = filtered.reduce<Record<string, Candidate[]>>((acc, c) => {
    const group = c.theme_group || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(c)
    return acc
  }, {})

  async function approve(id: string) {
    setActioningId(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/candidates/${id}/approve`, { method: 'POST' })
      const result = await res.json()
      if (result.ok) {
        const n = result.new_tickers ?? 0
        setMessage(`✅ Approved — ${n} new ticker(s) added. Run: ${result.next_steps?.[0] ?? 'generate-archetype-playbooks.ts'}`)
        mutate()
      } else {
        setMessage(`❌ ${result.error ?? 'approval failed'}`)
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setActioningId(null)
      setTimeout(() => setMessage(null), 8000)
    }
  }

  async function reject(id: string) {
    setActioningId(id)
    try {
      await fetch(`/api/admin/candidates/${id}/reject`, { method: 'POST' })
      mutate()
    } finally {
      setActioningId(null)
    }
  }

  async function bulkApprove(importance: string) {
    if (!confirm(`Approve all ${importance.toUpperCase()} candidates without duplicate warnings?`)) return
    const targets = candidates.filter(
      (c) =>
        c.status === 'pending' &&
        c.estimated_importance === importance &&
        (!c.similarity_warnings || c.similarity_warnings.length === 0)
    )
    for (const c of targets) {
      await fetch(`/api/admin/candidates/${c.id}/approve`, { method: 'POST' })
    }
    mutate()
    setMessage(`✅ Approved ${targets.length} ${importance} candidate(s)`)
    setTimeout(() => setMessage(null), 8000)
  }

  async function bulkReject(importance: string) {
    if (!confirm(`Reject all ${importance.toUpperCase()} pending candidates?`)) return
    const targets = candidates.filter(
      (c) => c.status === 'pending' && c.estimated_importance === importance
    )
    for (const c of targets) {
      await fetch(`/api/admin/candidates/${c.id}/reject`, { method: 'POST' })
    }
    mutate()
    setMessage(`Rejected ${targets.length} ${importance} candidate(s)`)
    setTimeout(() => setMessage(null), 5000)
  }

  const pendingHigh = byStatus.pending.filter((c) => c.estimated_importance === 'high' && (!c.similarity_warnings || c.similarity_warnings.length === 0)).length
  const pendingMedium = byStatus.pending.filter((c) => c.estimated_importance === 'medium').length

  if (isLoading) return <div className="p-8 text-zinc-500 text-sm">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-1">Archetype Candidates</h1>
        <p className="text-sm text-zinc-500">
          Review new themes from weekly market scan. Approve to create archetype + seed tickers.
        </p>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-800">
          {message}
        </div>
      )}

      {/* Filter tabs + batch actions */}
      <div className="flex items-end justify-between mb-6 border-b border-zinc-200">
        <div className="flex gap-6">
          {(['pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`pb-3 text-sm capitalize transition-colors ${
                filter === s
                  ? 'border-b-2 border-zinc-900 font-medium text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {s} ({byStatus[s].length})
            </button>
          ))}
        </div>

        {filter === 'pending' && (
          <div className="flex gap-2 pb-3">
            <button
              onClick={() => bulkReject('medium')}
              disabled={pendingMedium === 0}
              className="px-3 py-1.5 text-xs border border-zinc-300 rounded hover:bg-zinc-50 disabled:opacity-40 transition-colors"
            >
              Reject all MEDIUM ({pendingMedium})
            </button>
            <button
              onClick={() => bulkApprove('high')}
              disabled={pendingHigh === 0}
              className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Approve all HIGH ({pendingHigh})
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-zinc-400 py-16 text-sm">No {filter} candidates</p>
      ) : (
        <div>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mt-8 mb-3">
                {group} ({items.length})
              </h2>
              <div className="space-y-3">
                {items.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onApprove={() => approve(c.id)}
                    onReject={() => reject(c.id)}
                    isActioning={actioningId === c.id}
                    showActions={filter === 'pending'}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 pt-6 border-t border-zinc-200 text-xs text-zinc-500">
        <p className="mb-2 font-medium">After approving, run locally:</p>
        <pre className="bg-zinc-50 border border-zinc-200 p-3 rounded font-mono leading-relaxed">
{`npx tsx scripts/generate-archetype-playbooks.ts --archetype=<id>
npx tsx scripts/sync-playbooks-to-db.ts
npx tsx scripts/fetch-ticker-logos.ts`}
        </pre>
      </div>
    </div>
  )
}

function CandidateCard({
  candidate: c,
  onApprove,
  onReject,
  isActioning,
  showActions,
}: {
  candidate: Candidate
  onApprove: () => void
  onReject: () => void
  isActioning: boolean
  showActions: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const importanceColor = {
    high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-zinc-50 text-zinc-600 border-zinc-200',
  }[c.estimated_importance]

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5 hover:border-zinc-300 transition-colors">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-base leading-snug text-zinc-900">{c.title}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-zinc-600">
              {c.category}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded border ${importanceColor}`}>
              {c.estimated_importance}
            </span>
            <span className="text-xs text-zinc-400">scanned {c.scan_date}</span>
          </div>
        </div>

        {showActions && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onApprove}
              disabled={isActioning}
              className="px-4 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {isActioning ? '…' : 'Approve'}
            </button>
            <button
              onClick={onReject}
              disabled={isActioning}
              className="px-4 py-1.5 bg-white border border-zinc-300 text-zinc-700 text-sm rounded hover:bg-zinc-50 disabled:opacity-40 transition-colors"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {c.similarity_warnings && c.similarity_warnings.length > 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded">
          <div className="text-xs font-medium text-amber-900 mb-1.5">
            ⚠️ Similar to {c.similarity_warnings.length} existing theme(s)
          </div>
          <ul className="space-y-2">
            {c.similarity_warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-800">
                <span className="font-medium">{w.target_name}</span>
                <span className="text-amber-600 ml-1">
                  ({(w.similarity_score * 100).toFixed(0)}% match)
                </span>
                <div className="text-amber-700 mt-0.5">{w.reason}</div>
                <div className="text-amber-500 mt-0.5 italic">
                  Suggestion: {w.recommendation.replace(/_/g, ' ')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-zinc-700 mt-3 leading-relaxed">{c.description}</p>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:underline mt-3"
      >
        {expanded ? 'Hide details ▲' : 'Show details ▼'}
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-zinc-100 space-y-4 text-sm">
          {c.why_this_matters && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">
                Why this is a theme
              </div>
              <p className="text-zinc-700">{c.why_this_matters}</p>
            </div>
          )}

          {c.initial_tickers?.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                Initial tickers ({c.initial_tickers.length})
              </div>
              <div className="space-y-1.5">
                {c.initial_tickers.map((t, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded flex-shrink-0">
                      ${t.symbol}
                    </span>
                    <span className="text-xs text-zinc-600">{t.reasoning}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.recent_events?.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                Recent events
              </div>
              <ul className="space-y-1.5">
                {c.recent_events.map((e, i) => (
                  <li key={i} className="text-xs text-zinc-600 pl-3 border-l-2 border-zinc-200">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-zinc-400 pt-2 border-t border-zinc-100">
            Proposed ID:{' '}
            <code className="bg-zinc-100 px-1.5 py-0.5 rounded">{c.proposed_archetype_id}</code>
          </div>
        </div>
      )}
    </div>
  )
}
