'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Empty,
  Flex,
  Grid,
  Input,
  Layout,
  Space,
  Typography,
  theme,
} from 'antd'
import { DownOutlined, FireFilled, MoonOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { ThemeCard } from '@/components/radar/ThemeCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterPill } from '@/components/shared/FilterPill'
import { FilterLabel } from '@/components/shared/FilterLabel'
import { LayersIcon } from '@/components/shared/NavIcons'
import { ThemeMapGridSkeleton } from '@/components/skeleton'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { useField } from '@/lib/useField'
import type { ThemeRadarItem, ThemeChildRef, PlaybookStage } from '@/types/recommendations'
import '../radar.css'

type StatusFilter = 'all' | 'active' | 'cooling'
type StageFilter = 'all' | PlaybookStage

const { Text, Title } = Typography
const { Header, Content } = Layout
const { useToken } = theme
const { useBreakpoint } = Grid

const SUBTHEME_LIMIT = 4

const HEAT_PALETTE_LIGHT = {
  critical: { color: '#9C463B', background: '#F0D9D2' },
  high: { color: '#2A4488', background: '#DCE4F2' },
  medium: { color: '#155C3B', background: '#D6E9DA' },
  low: { color: '#5E646D', background: '#EBEEF2' },
} as const

const HEAT_PALETTE_DARK = {
  critical: { color: '#D49285', background: 'rgba(200, 122, 107, 0.16)' },
  high: { color: '#D4A862', background: 'rgba(200, 154, 82, 0.16)' },
  medium: { color: '#B5C272', background: 'rgba(143, 160, 88, 0.16)' },
  low: { color: '#A8A196', background: 'rgba(143, 138, 126, 0.18)' },
} as const

function HeatIcon({ score }: { score: number }) {
  const { mode } = useThemeMode()
  const palette = mode === 'dark' ? HEAT_PALETTE_DARK : HEAT_PALETTE_LIGHT
  const level =
    score >= 80 ? { ...palette.critical, count: 3 }
    : score >= 55 ? { ...palette.high, count: 2 }
    : score >= 30 ? { ...palette.medium, count: 1 }
    : { ...palette.low, count: 1 }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <FireFilled
          key={i}
          style={{
            color: i < level.count ? level.color : 'var(--line-2)',
            fontSize: 12,
          }}
        />
      ))}
    </span>
  )
}

function SubthemeStrip({ subs }: { subs: ThemeChildRef[] }) {
  const { locale } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const more = subs.length - SUBTHEME_LIMIT
  const overflow = subs.slice(SUBTHEME_LIMIT)
  const head = subs.slice(0, SUBTHEME_LIMIT)
  return (
    <div
      style={{
        borderTop: '1px solid var(--line-2)',
        padding: '10px 20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flexGrow: 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'none',
          color: 'var(--ink-4)',
          paddingBottom: 4,
          borderBottom: '1px solid var(--line-2)',
        }}
      >
        <span>{locale === 'zh' ? '次要主题' : 'Secondary'}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 500, letterSpacing: '0.1em' }}>
          {subs.length}
        </span>
      </div>
      {head.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--ink-4)', padding: '4px 0' }}>
          —
        </div>
      )}
      {head.map((s) => (
        <SubthemeRow key={s.id} sub={s} />
      ))}
      {more > 0 && (
        <div
          aria-hidden={!expanded}
          style={{
            display: 'grid',
            gridTemplateRows: expanded ? '1fr' : '0fr',
            transition: 'grid-template-rows 280ms cubic-bezier(0.22, 0.9, 0.32, 1)',
          }}
        >
          <div
            style={{
              overflow: 'hidden',
              minHeight: 0,
              opacity: expanded ? 1 : 0,
              transition: 'opacity 200ms ease',
              transitionDelay: expanded ? '120ms' : '0ms',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {overflow.map((s) => (
                <SubthemeRow key={s.id} sub={s} />
              ))}
            </div>
          </div>
        </div>
      )}
      {more > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 4,
            background: 'transparent',
            border: 'none',
            borderTop: '1px dashed var(--line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'none',
            color: 'var(--ink-4)',
            cursor: 'pointer',
            fontFeatureSettings: '"tnum"',
            width: '100%',
            padding: '6px 0 0',
          }}
        >
          <span>
            {expanded
              ? locale === 'zh' ? '收起' : 'Collapse'
              : locale === 'zh' ? `+${more} 展开` : `+${more} more · expand`}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 10,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 240ms cubic-bezier(0.22, 0.9, 0.32, 1)',
            }}
          >
            <DownOutlined />
          </span>
        </button>
      )}
    </div>
  )
}

function SubthemeRow({ sub }: { sub: ThemeChildRef }) {
  const name = useField(sub, 'name')
  return (
    <a
      href={`/themes/${sub.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'baseline',
        gap: 10,
        fontSize: 12,
        lineHeight: 1.4,
        color: 'var(--ink-2)',
        cursor: 'pointer',
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: 'var(--ink-4)', marginRight: 7 }}>·</span>
        {name}
      </span>
      <HeatIcon score={sub.theme_strength_score ?? 0} />
    </a>
  )
}

export default function ThemeMapPage() {
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const { mode, toggle } = useThemeMode()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const sidePad = isMobile ? 16 : 28

  const [themes, setThemes] = useState<ThemeRadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/themes/map')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setThemes((data.themes ?? []) as ThemeRadarItem[])
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const sorted = useMemo(
    () =>
      [...themes].sort(
        (a, b) => (b.theme_strength_score ?? 0) - (a.theme_strength_score ?? 0),
      ),
    [themes],
  )

  const filtered = useMemo(() => {
    return sorted.filter((th) => {
      if (statusFilter !== 'all' && th.status !== statusFilter) return false
      if (stageFilter !== 'all' && th.playbook_stage !== stageFilter) return false
      if (categoryFilter !== 'all' && th.category !== categoryFilter) return false
      return true
    })
  }, [sorted, statusFilter, stageFilter, categoryFilter])

  const categoryPills = useMemo(() => {
    const counts = new Map<string, number>()
    for (const th of sorted) {
      if (!th.category) continue
      counts.set(th.category, (counts.get(th.category) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [sorted])

  const subCount = filtered.reduce(
    (n, th) => n + (th.child_themes?.length ?? 0),
    0,
  )

  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <Layout style={{ background: 'transparent' }}>
          <Topbar sidePad={sidePad} />

          <Content
            style={{
              padding: `0 ${sidePad}px 40px`,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <PageHeader
              title={t('sidebar.themes')}
              icon={<LayersIcon />}
              stats={[
                {
                  value: filtered.length,
                  label: t('themes_page.core_themes'),
                },
                {
                  value: subCount,
                  label: t('themes_page.subthemes'),
                },
              ]}
              meta={
                filtered.length !== sorted.length
                  ? t('themes_page.showing_filtered', {
                      n: filtered.length,
                      total: sorted.length,
                    })
                  : locale === 'zh' ? '按主题强度排序' : 'Sorted by strength'
              }
            />

            {!loading && !error && sorted.length > 0 && (
              <Flex
                vertical
                gap={10}
                className="filters-bar"
                style={{
                  marginTop: 18,
                  marginBottom: 22,
                  paddingBottom: 18,
                  borderBottom: `1px solid ${token.colorSplit}`,
                }}
              >
                <Flex gap={8} wrap align="center">
                  <FilterLabel locale={locale} minWidth={locale === 'zh' ? 24 : 52}>{t('themes_page.filter_status')}</FilterLabel>
                  {(['all', 'active', 'cooling'] as StatusFilter[]).map((s) => (
                    <FilterPill
                      key={s}
                      label={t(`themes_page.status_${s}`)}
                      active={statusFilter === s}
                      onClick={() => setStatusFilter(s)}
                    />
                  ))}
                </Flex>

                <Flex gap={8} wrap align="center">
                  <FilterLabel locale={locale} minWidth={locale === 'zh' ? 24 : 52}>{t('themes_page.filter_category')}</FilterLabel>
                  <FilterPill
                    label={t('themes_page.status_all')}
                    active={categoryFilter === 'all'}
                    onClick={() => setCategoryFilter('all')}
                  />
                  {categoryPills.map(([cat, count]) => (
                    <FilterPill
                      key={cat}
                      label={t(`categories.${cat}`) || cat}
                      count={count}
                      active={categoryFilter === cat}
                      onClick={() => setCategoryFilter(cat)}
                    />
                  ))}
                </Flex>

                <Flex gap={8} wrap align="center">
                  <FilterLabel locale={locale} minWidth={locale === 'zh' ? 24 : 52}>{t('themes_page.filter_stage')}</FilterLabel>
                  {(['all', 'early', 'mid', 'late', 'beyond'] as StageFilter[]).map(
                    (s) => (
                      <FilterPill
                        key={s}
                        label={t(`themes_page.stage_${s}`)}
                        active={stageFilter === s}
                        onClick={() => setStageFilter(s)}
                      />
                    ),
                  )}
                </Flex>

              </Flex>
            )}

            {loading && <ThemeMapGridSkeleton count={6} />}

            {error && !loading && (
              <div style={{ padding: 40, color: token.colorError }}>
                {locale === 'zh' ? '错误：' : 'Error: '}{error}
              </div>
            )}

            {!loading && !error && sorted.length === 0 && (
              <Empty
                description={locale === 'zh' ? '未找到核心主题' : 'No umbrella themes found.'}
                style={{ padding: '40px 0' }}
              />
            )}

            {!loading && !error && sorted.length > 0 && filtered.length === 0 && (
              <Empty
                description={t('themes_page.empty_filtered')}
                style={{ padding: '60px 0' }}
              />
            )}

            {!loading && !error && filtered.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gridAutoRows: 'auto',
                  alignItems: 'stretch',
                  gap: 20,
                  marginTop: 8,
                }}
                className="theme-map-grid"
              >
                {filtered.map((th) => (
                  <div
                    key={th.id}
                    className="theme-map-cell hover-card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: token.borderRadiusLG,
                      background: token.colorBgContainer,
                      overflow: 'hidden',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <div style={{ height: 320, flexShrink: 0, overflow: 'hidden' }}>
                      <ThemeCard theme={th} variant="core" />
                    </div>
                    <SubthemeStrip subs={th.child_themes} />
                  </div>
                ))}
              </div>
            )}

          </Content>
        </Layout>
      </div>

      <style jsx>{`
        :global(.theme-map-cell) :global(.ant-card) {
          border: none !important;
          border-radius: 0 !important;
          background: transparent !important;
          height: 100% !important;
          box-shadow: none !important;
        }
        :global(.theme-map-cell) :global(.ant-card:hover) {
          box-shadow: none !important;
          border-color: transparent !important;
        }
        :global(.theme-map-cell) :global(.ant-card-body) {
          height: 100% !important;
        }
        :global(.theme-map-cell) > div > a {
          display: block;
          height: 100%;
        }
        @media (max-width: 1100px) {
          :global(.theme-map-grid) {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 720px) {
          :global(.theme-map-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
