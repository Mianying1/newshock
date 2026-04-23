'use client'
import { useMemo, useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface FitRow {
  ticker_symbol: string
  archetype_id: string
  archetype_name: string
  archetype_category: string | null
  fit_score: number
  exposure_label: string | null
  relationship_type: string | null
  evidence_summary: string | null
  evidence_summary_zh: string | null
  data_source: string
  last_validated_at: string | null
  in_typical_tickers: boolean
}

interface ArchetypeOption {
  id: string
  name: string
  category: string | null
  count: number
}

interface Response {
  rows: FitRow[]
  archetypes: ArchetypeOption[]
  total: number
}

interface EditState {
  open: boolean
  row: FitRow | null
  fit_score: string
  exposure_label: string
  evidence: string
  evidence_zh: string
  error: string | null
  submitting: boolean
}

const EMPTY_EDIT: EditState = {
  open: false,
  row: null,
  fit_score: '',
  exposure_label: '',
  evidence: '',
  evidence_zh: '',
  error: null,
  submitting: false,
}

const LABEL_COLORS: Record<string, { bg: string; fg: string }> = {
  direct: { bg: '#d1fae5', fg: '#065f46' },
  secondary: { bg: '#dbeafe', fg: '#1e40af' },
  peripheral: { bg: '#f3f4f6', fg: '#374151' },
  pressure: { bg: '#fee2e2', fg: '#991b1b' },
  uncertain: { bg: '#fef3c7', fg: '#92400e' },
}

const SOURCE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  manual: { bg: '#dcfce7', fg: '#166534', label: '✓ approved' },
  fmp_validated: { bg: '#e0f2fe', fg: '#075985', label: 'fmp ✓' },
  ai_generated: { bg: '#fef3c7', fg: '#92400e', label: 'ai · pending' },
}

export default function AdminTickerGraphPage() {
  const [filterArchetype, setFilterArchetype] = useState<string>('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [minFit, setMinFit] = useState<number>(0)
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT)
  const [toast, setToast] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (filterArchetype) params.set('archetype_id', filterArchetype)
  if (pendingOnly) params.set('pending', '1')
  if (minFit > 0) params.set('min_fit', String(minFit))

  const { data, error, isLoading, mutate } = useSWR<Response>(
    `/api/admin/ticker-graph${params.toString() ? `?${params}` : ''}`,
    fetcher
  )

  const archetypes = data?.archetypes ?? []

  const grouped = useMemo(() => {
    const rows = data?.rows ?? []
    const m = new Map<string, { name: string; category: string | null; rows: FitRow[] }>()
    for (const r of rows) {
      const e = m.get(r.archetype_id) ?? { name: r.archetype_name, category: r.archetype_category, rows: [] }
      e.rows.push(r)
      m.set(r.archetype_id, e)
    }
    return Array.from(m.entries())
  }, [data?.rows])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function act(action: string, row: FitRow) {
    const res = await fetch('/api/admin/ticker-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ticker_symbol: row.ticker_symbol,
        archetype_id: row.archetype_id,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash(`${action} failed: ${j.error ?? res.status}`)
      return
    }
    flash(`${action} ✓ ${row.ticker_symbol}`)
    mutate()
  }

  async function batchApprove(threshold: number) {
    if (!confirm(`Approve all rows with fit_score >= ${threshold}${filterArchetype ? ` in this archetype` : ' across ALL archetypes'}?`)) return
    const res = await fetch('/api/admin/ticker-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve_batch',
        min_fit_score: threshold,
        filter_archetype_id: filterArchetype || null,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      flash(`batch failed: ${j.error ?? res.status}`)
      return
    }
    const j = await res.json()
    flash(`batch approved ${j.approved ?? 0} rows`)
    mutate()
  }

  function openEdit(row: FitRow) {
    setEdit({
      open: true,
      row,
      fit_score: String(row.fit_score),
      exposure_label: row.exposure_label ?? '',
      evidence: row.evidence_summary ?? '',
      evidence_zh: row.evidence_summary_zh ?? '',
      error: null,
      submitting: false,
    })
  }

  async function submitEdit() {
    if (!edit.row) return
    const score = parseFloat(edit.fit_score)
    if (Number.isNaN(score) || score < 0 || score > 10) {
      setEdit((e) => ({ ...e, error: 'fit_score must be 0-10' }))
      return
    }
    setEdit((e) => ({ ...e, submitting: true, error: null }))
    const res = await fetch('/api/admin/ticker-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit',
        ticker_symbol: edit.row.ticker_symbol,
        archetype_id: edit.row.archetype_id,
        fit_score: score,
        exposure_label: edit.exposure_label,
        evidence_summary: edit.evidence,
        evidence_summary_zh: edit.evidence_zh,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setEdit((e) => ({ ...e, submitting: false, error: j.error ?? 'edit failed' }))
      return
    }
    setEdit(EMPTY_EDIT)
    flash('edit ✓')
    mutate()
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Ticker Graph · Review</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        AI-generated ticker × archetype fits. Approve (→ manual) · Reject (delete) · Edit score/label/evidence.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
          padding: 12,
          background: '#fafafa',
          border: '1px solid #eee',
          borderRadius: 8,
        }}
      >
        <label style={{ fontSize: 12 }}>
          Archetype{' '}
          <select
            value={filterArchetype}
            onChange={(e) => setFilterArchetype(e.target.value)}
            style={{ padding: 4, border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
          >
            <option value="">— all —</option>
            {archetypes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 12 }}>
          Min fit_score{' '}
          <input
            type="number"
            value={minFit}
            step="0.5"
            min="0"
            max="10"
            onChange={(e) => setMinFit(parseFloat(e.target.value) || 0)}
            style={{ width: 60, padding: 4, border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
          />
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
          pending only
        </label>

        <span style={{ flex: 1 }} />

        <button
          onClick={() => batchApprove(8)}
          style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #0070f3', color: '#0070f3', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
        >
          Approve all fit ≥ 8
        </button>
      </div>

      {isLoading && <p style={{ fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ fontSize: 13, color: '#c00' }}>Failed to load.</p>}
      {!isLoading && !error && (data?.rows ?? []).length === 0 && <p style={{ fontSize: 13, color: '#666' }}>No rows.</p>}

      {grouped.map(([archId, { name, category, rows: rs }]) => (
        <section key={archId} style={{ marginBottom: 20, border: '1px solid #eaeaea', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#f6f6f6', borderBottom: '1px solid #eaeaea', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <b style={{ fontSize: 14 }}>{name}</b>
            <span style={{ fontSize: 11, color: '#888' }}>{category ?? '—'}</span>
            <span style={{ fontSize: 11, color: '#555' }}>· {rs.length} tickers</span>
          </div>

          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fbfbfb', textAlign: 'left' }}>
                <th style={{ padding: 6, width: 90 }}>symbol</th>
                <th style={{ padding: 6, width: 50 }}>fit</th>
                <th style={{ padding: 6, width: 95 }}>exposure</th>
                <th style={{ padding: 6, width: 80 }}>source</th>
                <th style={{ padding: 6 }}>evidence</th>
                <th style={{ padding: 6, width: 180 }}>actions</th>
              </tr>
            </thead>
            <tbody>
              {rs.map((r) => {
                const labelCol = LABEL_COLORS[r.exposure_label ?? ''] ?? { bg: '#f3f4f6', fg: '#555' }
                const srcCol = SOURCE_COLORS[r.data_source] ?? { bg: '#f3f4f6', fg: '#555', label: r.data_source }
                return (
                  <tr key={`${r.ticker_symbol}-${r.archetype_id}`} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: 6, fontFamily: 'ui-monospace,monospace', fontWeight: 600 }}>
                      {r.ticker_symbol}
                      {r.in_typical_tickers && (
                        <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>★</span>
                      )}
                    </td>
                    <td style={{ padding: 6 }}>{r.fit_score.toFixed(1)}</td>
                    <td style={{ padding: 6 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: labelCol.bg, color: labelCol.fg }}>
                        {r.exposure_label ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: 6 }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: srcCol.bg, color: srcCol.fg }}>
                        {srcCol.label}
                      </span>
                    </td>
                    <td style={{ padding: 6, color: '#444', lineHeight: 1.4 }}>
                      {r.evidence_summary ?? '—'}
                      {r.relationship_type && (
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>rel: {r.relationship_type}</div>
                      )}
                    </td>
                    <td style={{ padding: 6 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {r.data_source !== 'manual' && (
                          <button
                            onClick={() => act('approve', r)}
                            style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #059669', color: '#059669', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
                          >
                            approve
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(r)}
                          style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #6b7280', color: '#374151', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
                        >
                          edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Reject ${r.ticker_symbol} × ${r.archetype_id}?`)) act('reject', r)
                          }}
                          style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #dc2626', color: '#dc2626', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
                        >
                          reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#111',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 12,
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}

      {edit.open && edit.row && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setEdit(EMPTY_EDIT)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', padding: 24, borderRadius: 10, width: 540, maxHeight: '90vh', overflow: 'auto' }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>
              Edit · {edit.row.ticker_symbol}
            </h2>
            <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>{edit.row.archetype_name}</p>

            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ fontSize: 12, flex: 1 }}>
                fit_score (0-10)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={edit.fit_score}
                  onChange={(e) => setEdit((s) => ({ ...s, fit_score: e.target.value }))}
                  style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, flex: 1 }}>
                exposure_label
                <select
                  value={edit.exposure_label}
                  onChange={(e) => setEdit((s) => ({ ...s, exposure_label: e.target.value }))}
                  style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
                >
                  <option value="direct">direct</option>
                  <option value="secondary">secondary</option>
                  <option value="peripheral">peripheral</option>
                  <option value="pressure">pressure</option>
                  <option value="uncertain">uncertain</option>
                </select>
              </label>
            </div>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              evidence_summary (EN)
              <textarea
                rows={3}
                value={edit.evidence}
                onChange={(e) => setEdit((s) => ({ ...s, evidence: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </label>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              evidence_summary_zh (中文)
              <textarea
                rows={3}
                value={edit.evidence_zh}
                onChange={(e) => setEdit((s) => ({ ...s, evidence_zh: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </label>

            {edit.error && <p style={{ fontSize: 12, color: '#c00', marginTop: 8 }}>{edit.error}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEdit(EMPTY_EDIT)}
                disabled={edit.submitting}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={edit.submitting}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #0070f3', borderRadius: 6, background: '#0070f3', color: '#fff', cursor: 'pointer', opacity: edit.submitting ? 0.6 : 1 }}
              >
                {edit.submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
