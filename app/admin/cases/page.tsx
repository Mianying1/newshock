'use client'
import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface HistoricalCase {
  id: string
  archetype_id: string
  case_name: string
  case_name_zh: string | null
  start_date: string | null
  end_date: string | null
  trigger_type: string | null
  duration_days: number | null
  main_beneficiaries: string[]
  main_losers: string[]
  data_source: 'manual' | 'ai_sourced' | 'news_archive'
  confidence: 'high' | 'medium' | 'low'
}

interface Group {
  archetype_id: string
  archetype_name: string
  cases: HistoricalCase[]
}

interface AddFormState {
  open: boolean
  archetype_id: string
  case_name: string
  start_date: string
  end_date: string
  trigger_type: string
  beneficiaries: string
  losers: string
  notes: string
  confidence: 'high' | 'medium' | 'low'
  error: string | null
  submitting: boolean
}

const EMPTY_FORM: AddFormState = {
  open: false,
  archetype_id: '',
  case_name: '',
  start_date: '',
  end_date: '',
  trigger_type: '',
  beneficiaries: '',
  losers: '',
  notes: '',
  confidence: 'medium',
  error: null,
  submitting: false,
}

export default function AdminCasesPage() {
  const { data, error, isLoading, mutate } = useSWR<{ groups: Group[] }>(
    '/api/admin/cases',
    fetcher
  )
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM)

  function openFor(archetypeId: string) {
    setForm({ ...EMPTY_FORM, open: true, archetype_id: archetypeId })
  }

  async function submit() {
    if (!form.archetype_id || !form.case_name.trim()) {
      setForm((f) => ({ ...f, error: 'archetype + case_name required' }))
      return
    }
    setForm((f) => ({ ...f, submitting: true, error: null }))
    const payload = {
      archetype_id: form.archetype_id,
      case_name: form.case_name.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      trigger_type: form.trigger_type.trim() || null,
      main_beneficiaries: form.beneficiaries
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      main_losers: form.losers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      notes: form.notes.trim() || null,
      data_source: 'manual' as const,
      confidence: form.confidence,
      created_by: 'admin',
    }
    const res = await fetch('/api/admin/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'submit failed' }))
      setForm((f) => ({ ...f, submitting: false, error: j.error ?? 'submit failed' }))
      return
    }
    setForm(EMPTY_FORM)
    mutate()
  }

  const groups = data?.groups ?? []

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Case Library</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
        Historical cases keyed by archetype. Phase 5 playbook generator will select from here.
      </p>

      {isLoading && <p style={{ fontSize: 13 }}>Loading…</p>}
      {error && <p style={{ fontSize: 13, color: '#c00' }}>Failed to load cases.</p>}

      {!isLoading && !error && groups.length === 0 && (
        <p style={{ fontSize: 13, color: '#666' }}>No archetypes yet.</p>
      )}

      {groups.map((g) => (
        <section
          key={g.archetype_id}
          style={{
            border: '1px solid #eaeaea',
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <b style={{ fontSize: 14 }}>{g.archetype_name}</b>
              <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                {g.cases.length} case{g.cases.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              onClick={() => openFor(g.archetype_id)}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                border: '1px solid #ddd',
                borderRadius: 6,
                background: '#fafafa',
                cursor: 'pointer',
              }}
            >
              + Add case
            </button>
          </div>

          {g.cases.length > 0 && (
            <ul style={{ marginTop: 12, fontSize: 13, listStyle: 'none', padding: 0 }}>
              {g.cases.map((c) => (
                <li
                  key={c.id}
                  style={{
                    padding: '8px 0',
                    borderTop: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{c.case_name}</div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                    {c.start_date ?? '—'} → {c.end_date ?? '—'} ·{' '}
                    {c.trigger_type ?? 'no trigger'} · conf={c.confidence}
                  </div>
                  {(c.main_beneficiaries.length > 0 || c.main_losers.length > 0) && (
                    <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                      {c.main_beneficiaries.length > 0 && (
                        <span>
                          <span style={{ color: '#080' }}>↑</span>{' '}
                          {c.main_beneficiaries.join(', ')}
                        </span>
                      )}
                      {c.main_beneficiaries.length > 0 && c.main_losers.length > 0 && ' · '}
                      {c.main_losers.length > 0 && (
                        <span>
                          <span style={{ color: '#c00' }}>↓</span>{' '}
                          {c.main_losers.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {form.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setForm(EMPTY_FORM)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              padding: 24,
              borderRadius: 10,
              width: 520,
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Add case</h2>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              Case name *
              <input
                value={form.case_name}
                onChange={(e) => setForm((f) => ({ ...f, case_name: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12, flex: 1 }}>
                Start date
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
                />
              </label>
              <label style={{ fontSize: 12, flex: 1 }}>
                End date
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
                />
              </label>
            </div>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              Trigger type
              <input
                value={form.trigger_type}
                onChange={(e) => setForm((f) => ({ ...f, trigger_type: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </label>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              Main beneficiaries (comma-separated)
              <input
                value={form.beneficiaries}
                onChange={(e) => setForm((f) => ({ ...f, beneficiaries: e.target.value }))}
                placeholder="NVDA, AVGO"
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </label>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              Main losers (comma-separated)
              <input
                value={form.losers}
                onChange={(e) => setForm((f) => ({ ...f, losers: e.target.value }))}
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </label>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              />
            </label>

            <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              Confidence
              <select
                value={form.confidence}
                onChange={(e) =>
                  setForm((f) => ({ ...f, confidence: e.target.value as 'high' | 'medium' | 'low' }))
                }
                style={{ width: '100%', padding: 6, marginTop: 3, border: '1px solid #ddd', borderRadius: 4 }}
              >
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </label>

            {form.error && (
              <p style={{ fontSize: 12, color: '#c00', marginTop: 8 }}>{form.error}</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setForm(EMPTY_FORM)}
                disabled={form.submitting}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={form.submitting}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  border: '1px solid #0070f3',
                  borderRadius: 6,
                  background: '#0070f3',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: form.submitting ? 0.6 : 1,
                }}
              >
                {form.submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
