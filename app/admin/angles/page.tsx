'use client'
import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type FilterKey = 'pending' | 'approved' | 'dismissed' | 'all'

interface AngleRow {
  id: string
  umbrella_theme_id: string
  umbrella_theme_name: string
  trigger_event_id: string | null
  angle_label: string
  angle_description: string | null
  proposed_tickers: string[]
  gap_reasoning: string | null
  confidence: number | null
  status: string
  reviewed_at: string | null
  created_at: string
}

interface ApiResponse {
  candidates: AngleRow[]
  total: number
  counts: { pending: number; approved: number; dismissed: number; all: number }
  filter: FilterKey
}

export default function AdminAnglesPage() {
  const [filter, setFilter] = useState<FilterKey>('pending')
  const { data, mutate, isLoading } = useSWR<ApiResponse>(
    `/api/admin/angles?status=${filter}`,
    fetcher
  )
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const counts = data?.counts ?? { pending: 0, approved: 0, dismissed: 0, all: 0 }
  const candidates = data?.candidates ?? []

  async function act(id: string, action: 'approve' | 'dismiss' | 'reopen') {
    setActioningId(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/angles/${id}/${action}`, { method: 'POST' })
      const result = await res.json()
      if (result.ok) {
        setMessage(`✅ ${action}`)
        mutate()
      } else {
        setMessage(`❌ ${result.error ?? action + ' failed'}`)
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setActioningId(null)
      setTimeout(() => setMessage(null), 5000)
    }
  }

  if (isLoading) return <div className="p-8 text-zinc-500 text-sm">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 min-h-screen">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-900">← Admin</Link>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 mb-1">New Angle Candidates</h1>
        <p className="text-sm text-zinc-500">
          Sonnet-proposed long-horizon angles from recent events under each umbrella theme.
          Approved ones surface on /tickers · 长周期潜力股 tab.
        </p>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded text-sm text-zinc-800">
          {message}
        </div>
      )}

      <div className="flex gap-6 border-b border-zinc-200 mb-6">
        {(['pending', 'approved', 'dismissed', 'all'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`pb-3 text-sm capitalize transition-colors ${
              filter === k
                ? 'border-b-2 border-zinc-900 font-medium text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {k} ({counts[k]})
          </button>
        ))}
      </div>

      {candidates.length === 0 ? (
        <p className="text-center text-zinc-400 py-16 text-sm">No {filter} candidates</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <AngleCard
              key={c.id}
              row={c}
              isActioning={actioningId === c.id}
              onApprove={() => act(c.id, 'approve')}
              onDismiss={() => act(c.id, 'dismiss')}
              onReopen={() => act(c.id, 'reopen')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AngleCard({
  row,
  isActioning,
  onApprove,
  onDismiss,
  onReopen,
}: {
  row: AngleRow
  isActioning: boolean
  onApprove: () => void
  onDismiss: () => void
  onReopen: () => void
}) {
  const confPct = row.confidence !== null ? Math.round(row.confidence * 100) : null
  const statusStyle: Record<string, string> = {
    pending: 'bg-violet-50 text-violet-700 border-violet-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dismissed: 'bg-zinc-50 text-zinc-500 border-zinc-200',
  }
  const isPending = row.status === 'pending'
  const isApproved = row.status === 'approved'
  const isDismissed = row.status === 'dismissed'

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-base leading-snug text-zinc-900">
              {row.angle_label}
            </h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide font-medium ${statusStyle[row.status] ?? statusStyle.pending}`}>
              {row.status}
            </span>
            {confPct !== null && (
              <span className="text-xs font-mono text-zinc-600 px-2 py-0.5 bg-zinc-50 rounded border border-zinc-200">
                {confPct}%
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            umbrella: <span className="text-zinc-700">{row.umbrella_theme_name}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isPending && (
            <>
              <button
                onClick={onApprove}
                disabled={isActioning}
                className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 disabled:opacity-40"
              >
                {isActioning ? '…' : 'Approve'}
              </button>
              <button
                onClick={onDismiss}
                disabled={isActioning}
                className="px-3 py-1.5 bg-white border border-zinc-300 text-zinc-700 text-xs rounded hover:bg-zinc-50 disabled:opacity-40"
              >
                Dismiss
              </button>
            </>
          )}
          {isApproved && (
            <button
              onClick={onDismiss}
              disabled={isActioning}
              className="px-3 py-1.5 bg-white border border-zinc-300 text-zinc-700 text-xs rounded hover:bg-zinc-50 disabled:opacity-40"
            >
              Dismiss
            </button>
          )}
          {isDismissed && (
            <button
              onClick={onReopen}
              disabled={isActioning}
              className="px-3 py-1.5 bg-white border border-zinc-300 text-zinc-700 text-xs rounded hover:bg-zinc-50 disabled:opacity-40"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      {row.angle_description && (
        <p className="text-sm text-zinc-700 mt-3 leading-relaxed">{row.angle_description}</p>
      )}

      {row.proposed_tickers.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 mb-1.5">
            Proposed tickers ({row.proposed_tickers.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {row.proposed_tickers.map((sym) => (
              <span
                key={sym}
                className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-700"
              >
                {sym}
              </span>
            ))}
          </div>
        </div>
      )}

      {row.gap_reasoning && (
        <div className="mt-3 text-xs p-3 bg-blue-50 border border-blue-100 rounded text-blue-900">
          <span className="font-medium">Gap reasoning: </span>
          {row.gap_reasoning}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400 flex gap-3">
        <span>created {new Date(row.created_at).toLocaleDateString()}</span>
        {row.reviewed_at && (
          <span>reviewed {new Date(row.reviewed_at).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  )
}
