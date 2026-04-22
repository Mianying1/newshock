'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { useI18n } from '@/lib/i18n-context'
import { useField } from '@/lib/useField'
import { formatRelativeTime } from '@/lib/utils'
import { formatCategoryLabel } from '@/lib/theme-formatter'
import type { ThemeRadarItem } from '@/types/recommendations'
import '../radar.css'

type StatusFilter = 'active' | 'cooling' | 'archived' | 'all'
type SortKey = 'strength' | 'recent' | 'created'

const STATUS_FETCH: Record<StatusFilter, string> = {
  active: 'active',
  cooling: 'cooling',
  archived: 'archived',
  all: 'active,cooling,archived',
}

function ThemeRow({ theme }: { theme: ThemeRadarItem }) {
  const { t, locale } = useI18n()
  const name = useField(theme, 'name')
  const summary = useField(theme, 'summary')
  const lastAgo = formatRelativeTime(theme.latest_event_date, t, locale)
  const categoryLabel = formatCategoryLabel(theme.category)

  return (
    <Link
      href={`/themes/${theme.id}`}
      style={{
        display: 'block',
        padding: '14px 16px',
        background: '#fff',
        border: '1px solid var(--line-2)',
        borderRadius: 10,
        textDecoration: 'none',
        color: 'inherit',
        minHeight: 118,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.3, minWidth: 0 }}>
          {name}
        </div>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {t('themes_list.strength')} {theme.theme_strength_score.toFixed(0)}
        </div>
      </div>

      {summary && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            lineHeight: 1.45,
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {summary}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 }}>
        <span
          style={{
            background: 'var(--surface-2)',
            color: 'var(--ink-3)',
            padding: '2px 7px',
            borderRadius: 999,
            border: '1px solid var(--line-2)',
          }}
        >
          {categoryLabel}
        </span>
        <span
          style={{
            background:
              theme.status === 'active'
                ? 'rgba(34,197,94,0.08)'
                : theme.status === 'cooling'
                  ? 'rgba(245,158,11,0.08)'
                  : 'var(--surface-2)',
            color:
              theme.status === 'active'
                ? '#047857'
                : theme.status === 'cooling'
                  ? '#b45309'
                  : 'var(--ink-4)',
            padding: '2px 7px',
            borderRadius: 999,
            border: '1px solid var(--line-2)',
            textTransform: 'capitalize',
          }}
        >
          {theme.status}
        </span>
        <span style={{ color: 'var(--ink-4)' }}>
          {t('themes_list.events', { n: theme.event_count })} · {lastAgo}
        </span>
      </div>
    </Link>
  )
}

export default function ThemesListPage() {
  const { t } = useI18n()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [sort, setSort] = useState<SortKey>('strength')
  const [themes, setThemes] = useState<ThemeRadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({
      status: STATUS_FETCH[statusFilter],
      limit: '200',
    })
    fetch(`/api/themes?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then((data) => {
        setThemes(data.themes ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [statusFilter])

  const sorted = useMemo(() => {
    const arr = [...themes]
    if (sort === 'strength') {
      arr.sort((a, b) => b.theme_strength_score - a.theme_strength_score)
    } else if (sort === 'recent') {
      arr.sort(
        (a, b) =>
          new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
      )
    } else {
      arr.sort(
        (a, b) =>
          new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime()
      )
    }
    return arr
  }, [themes, sort])

  const filterButtons: { key: StatusFilter; labelKey: string }[] = [
    { key: 'active', labelKey: 'themes_list.filter_active' },
    { key: 'cooling', labelKey: 'themes_list.filter_cooling' },
    { key: 'archived', labelKey: 'themes_list.filter_archived' },
    { key: 'all', labelKey: 'themes_list.filter_all' },
  ]

  const sortButtons: { key: SortKey; labelKey: string }[] = [
    { key: 'strength', labelKey: 'themes_list.sort_strength' },
    { key: 'recent', labelKey: 'themes_list.sort_recent' },
    { key: 'created', labelKey: 'themes_list.sort_created' },
  ]

  const tabBase: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: 12,
    borderRadius: 999,
    border: '1px solid var(--line-2)',
    background: '#fff',
    color: 'var(--ink-2)',
    cursor: 'pointer',
  }
  const tabActive: React.CSSProperties = {
    ...tabBase,
    background: 'var(--ink-1)',
    color: '#fff',
    borderColor: 'var(--ink-1)',
  }

  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <main className="main">
          <div style={{ marginBottom: 18 }}>
            <Link
              href="/"
              style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'none' }}
            >
              {t('themes_list.back')}
            </Link>
          </div>

          <div className="page-head">
            <h1 className="page-title">{t('themes_list.title')}</h1>
            <div className="page-sub">
              <span>{t('themes_list.sub')}</span>
              <span className="sep">·</span>
              <span>{t('themes_list.count', { n: sorted.length })}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {filterButtons.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  style={statusFilter === f.key ? tabActive : tabBase}
                >
                  {t(f.labelKey)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', marginRight: 4 }}>
                {t('themes_list.sort_label')}
              </span>
              {sortButtons.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  style={sort === s.key ? tabActive : tabBase}
                >
                  {t(s.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('theme_detail.loading')}
            </p>
          )}
          {error && (
            <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('common.error')}
            </p>
          )}
          {!loading && !error && sorted.length === 0 && (
            <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-4)' }}>
              {t('themes_list.empty')}
            </p>
          )}

          {sorted.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 12,
              }}
            >
              {sorted.map((theme) => (
                <ThemeRow key={theme.id} theme={theme} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
