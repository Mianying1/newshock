'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Empty,
  Flex,
  Grid,
  Input,
  Layout,
  Select,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd'
import {
  LinkOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
} from '@ant-design/icons'
import useSWR from 'swr'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { FilterPill } from '@/components/shared/FilterPill'
import { FilterLabel } from '@/components/shared/FilterLabel'
import { PageHeader } from '@/components/shared/PageHeader'
import { ClockIcon } from '@/components/shared/NavIcons'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { formatRelativeTime } from '@/lib/utils'
import type { ThemeRadarItem } from '@/types/recommendations'
import '../radar.css'

const { Text, Title } = Typography
const { Header, Content } = Layout
const { useToken } = theme
const { useBreakpoint } = Grid

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M2 3.75L5 6.5L8 3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type TimeRange = 'latest' | 'week' | 'older'
type Importance = 'all' | 'high' | 'medium' | 'low'

interface EventItem {
  id: string
  title: string
  title_zh: string | null
  headline_full: string
  source: string | null
  source_bucket: string
  source_url: string | null
  event_date: string
  importance: 'structure' | 'subtheme' | 'event_only' | null
  theme: { id: string; name: string; name_zh: string | null } | null
  tickers: string[]
}

interface ListResponse {
  events: EventItem[]
  total: number
  has_more: boolean
}

interface SourcesResponse {
  sources: Array<{ name: string; count: number }>
}

interface ThemesResponse {
  themes: ThemeRadarItem[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PAGE_SIZE = 50

const IMPORTANCE_PALETTE_LIGHT = {
  high: { color: '#5C6A1E', background: '#F0F2D8' },
  medium: { color: '#6D6A63', background: '#EFEAE0' },
  low: { color: '#8F8A7E', background: '#F2EEE5' },
} as const

const IMPORTANCE_PALETTE_DARK = {
  high: { color: '#B5C272', background: 'rgba(143, 160, 88, 0.16)' },
  medium: { color: '#A8A196', background: 'rgba(143, 138, 126, 0.18)' },
  low: { color: '#7A7468', background: 'rgba(120, 115, 105, 0.16)' },
} as const

function ImportanceTag({
  importance,
  isDark,
  label,
}: {
  importance: 'structure' | 'subtheme' | 'event_only' | null
  isDark: boolean
  label: string
}) {
  if (!importance) return null
  const palette = isDark ? IMPORTANCE_PALETTE_DARK : IMPORTANCE_PALETTE_LIGHT
  const tier =
    importance === 'structure' ? palette.high
    : importance === 'subtheme' ? palette.medium
    : palette.low
  return (
    <Tag
      style={{
        background: tier.background,
        color: tier.color,
        border: 'none',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 500,
        margin: 0,
        lineHeight: 1.4,
      }}
    >
      {label}
    </Tag>
  )
}

const EventCard = memo(function EventCard({ ev }: { ev: EventItem }) {
  const { t, locale } = useI18n()
  const { token } = useToken()
  const { mode } = useThemeMode()

  const title = locale === 'zh' && ev.title_zh ? ev.title_zh : ev.title
  const themeName =
    ev.theme && (locale === 'zh' && ev.theme.name_zh ? ev.theme.name_zh : ev.theme.name)
  const tickers = ev.tickers.slice(0, 3)
  const tickerOverflow = ev.tickers.length - tickers.length
  const time = formatRelativeTime(ev.event_date, t, locale)

  const importanceLabel =
    ev.importance === 'structure' ? t('events_page.importance_high')
    : ev.importance === 'subtheme' ? t('events_page.importance_medium')
    : ev.importance === 'event_only' ? t('events_page.importance_low')
    : ''

  return (
    <a
      href={ev.source_url ?? '#'}
      className="event-card hover-card"
      style={{
        display: 'block',
        padding: '14px 18px',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
    >
      <Flex
        align="center"
        gap={10}
        style={{
          fontSize: 11,
          color: token.colorTextTertiary,
          letterSpacing: '0.04em',
          marginBottom: 6,
          fontFeatureSettings: '"tnum"',
        }}
      >
        <span style={{ fontFamily: token.fontFamilyCode }}>{time}</span>
        <span style={{ color: token.colorTextQuaternary }}>·</span>
        <span style={{ fontWeight: 500, color: token.colorTextSecondary }}>
          {ev.source ?? '—'}
        </span>
        {ev.importance && (
          <>
            <span style={{ color: token.colorTextQuaternary }}>·</span>
            <ImportanceTag
              importance={ev.importance}
              isDark={mode === 'dark'}
              label={importanceLabel}
            />
          </>
        )}
        <span style={{ flex: 1 }} />
        <LinkOutlined style={{ fontSize: 12, color: token.colorTextQuaternary }} />
      </Flex>

      <Text
        style={{
          display: 'block',
          fontSize: 15,
          fontWeight: 500,
          color: token.colorText,
          lineHeight: 1.45,
          marginBottom: 10,
        }}
      >
        {title}
      </Text>

      <Flex
        align="center"
        gap={14}
        wrap
        style={{
          fontSize: 12,
          color: token.colorTextTertiary,
        }}
      >
        {themeName ? (
          <Flex align="center" gap={6}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'none',
                color: token.colorTextQuaternary,
              }}
            >
              {t('events_page.linked_theme')}
            </span>
            <a
              href={`/themes/${ev.theme!.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                color: token.colorTextSecondary,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {themeName}
            </a>
          </Flex>
        ) : (
          <Flex align="center" gap={6}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'none',
                color: token.colorTextQuaternary,
              }}
            >
              {t('events_page.linked_theme')}
            </span>
            <span
              style={{
                color: token.colorTextSecondary,
                fontWeight: 500,
              }}
            >
              {t('events_page.unclassified')}
            </span>
          </Flex>
        )}
          {tickers.length > 0 && (
            <Flex align="center" gap={6}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'none',
                  color: token.colorTextQuaternary,
                }}
              >
                {t('events_page.tickers')}
              </span>
              {tickers.map((sym) => (
                <a
                  key={sym}
                  href={`/tickers/${sym}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontFamily: token.fontFamilyCode,
                    fontSize: 12,
                    fontWeight: 600,
                    color: token.colorTextSecondary,
                    textDecoration: 'none',
                    letterSpacing: '0.02em',
                  }}
                >
                  {sym}
                </a>
              ))}
              {tickerOverflow > 0 && (
                <span style={{ color: token.colorTextQuaternary, fontSize: 11 }}>
                  +{tickerOverflow}
                </span>
              )}
            </Flex>
          )}
        </Flex>
    </a>
  )
})

function SkeletonCard() {
  const { token } = useToken()
  return (
    <div
      style={{
        height: 84,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        opacity: 0.55,
      }}
    >
      <div
        style={{
          height: 12,
          width: '34%',
          background: token.colorFillTertiary,
          borderRadius: 4,
          margin: '14px 18px 8px',
        }}
      />
      <div
        style={{
          height: 14,
          width: '70%',
          background: token.colorFillTertiary,
          borderRadius: 4,
          margin: '0 18px 8px',
        }}
      />
      <div
        style={{
          height: 10,
          width: '40%',
          background: token.colorFillTertiary,
          borderRadius: 4,
          margin: '0 18px',
        }}
      />
    </div>
  )
}

export default function EventsPage() {
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const { mode, toggle } = useThemeMode()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const sidePad = isMobile ? 16 : 28

  const [timeRange, setTimeRange] = useState<TimeRange>('week')
  const [importance, setImportance] = useState<Importance>('all')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [themeId, setThemeId] = useState<string>('')

  const [events, setEvents] = useState<EventItem[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: sourcesResp } = useSWR<SourcesResponse>(
    '/api/events/sources',
    fetcher,
  )
  const { data: themesResp } = useSWR<ThemesResponse>('/api/themes/map', fetcher)

  const buildUrl = useCallback(
    (off: number) => {
      const params = new URLSearchParams()
      params.set('time_range', timeRange)
      params.set('importance', importance)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(off))
      if (themeId) params.set('theme_id', themeId)
      for (const s of selectedSources) params.append('source', s)
      return `/api/events/list?${params.toString()}`
    },
    [timeRange, importance, themeId, selectedSources],
  )

  // Reset and reload on filter change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setOffset(0)
    fetch(buildUrl(0))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: ListResponse) => {
        if (cancelled) return
        setEvents(data.events ?? [])
        setTotal(data.total ?? 0)
        setHasMore(Boolean(data.has_more))
        setLoading(false)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [buildUrl])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return
    const nextOffset = offset + PAGE_SIZE
    setLoadingMore(true)
    fetch(buildUrl(nextOffset))
      .then((r) => r.json())
      .then((data: ListResponse) => {
        setEvents((prev) => [...prev, ...(data.events ?? [])])
        setOffset(nextOffset)
        setHasMore(Boolean(data.has_more))
        setLoadingMore(false)
      })
      .catch(() => {
        setLoadingMore(false)
      })
  }, [buildUrl, hasMore, loading, loadingMore, offset])

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  const sourceOptions = useMemo(
    () =>
      (sourcesResp?.sources ?? []).map((s) => ({
        value: s.name,
        label: `${s.name} · ${s.count}`,
      })),
    [sourcesResp],
  )

  const themeOptions = useMemo(() => {
    const list = themesResp?.themes ?? []
    return [
      { value: '', label: t('events_page.all_themes') },
      ...list.map((th) => ({
        value: th.id,
        label: locale === 'zh' && th.name_zh ? th.name_zh : th.name,
      })),
    ]
  }, [themesResp, locale, t])

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
              title={t('sidebar.events')}
              icon={<ClockIcon />}
              stats={[
                {
                  value: total,
                  label: locale === 'zh' ? '事件' : 'Events',
                },
              ]}
              meta={t('events_page.refresh_frequency')}
            />

            <Flex
              vertical
              gap={10}
              style={{
                marginTop: 18,
                marginBottom: 22,
                paddingBottom: 18,
                borderBottom: `1px solid ${token.colorSplit}`,
              }}
            >
              <Flex gap={8} wrap align="center">
                <FilterLabel locale={locale} minWidth={locale === 'zh' ? 52 : 80}>{t('events_page.filter_time')}</FilterLabel>
                {(['latest', 'week', 'older'] as TimeRange[]).map((tr) => (
                  <FilterPill
                    key={tr}
                    label={t(`events_page.time_${tr}`)}
                    active={timeRange === tr}
                    onClick={() => setTimeRange(tr)}
                  />
                ))}
              </Flex>

              <Flex gap={8} wrap align="center">
                <FilterLabel locale={locale} minWidth={locale === 'zh' ? 52 : 80}>{t('events_page.filter_importance')}</FilterLabel>
                {(['all', 'high', 'medium', 'low'] as Importance[]).map((imp) => (
                  <FilterPill
                    key={imp}
                    label={t(`events_page.importance_${imp}`)}
                    active={importance === imp}
                    onClick={() => setImportance(imp)}
                  />
                ))}
              </Flex>

              <Flex gap={8} wrap align="center">
                <FilterLabel locale={locale} minWidth={locale === 'zh' ? 52 : 80}>{t('events_page.filter_source')}</FilterLabel>
                <Select
                  mode="multiple"
                  allowClear
                  variant="filled"
                  className="filter-select"
                  suffixIcon={<ChevronDownIcon />}
                  placeholder={t('events_page.all_sources')}
                  value={selectedSources}
                  onChange={setSelectedSources}
                  options={sourceOptions}
                  style={{ width: 240 }}
                  maxTagCount="responsive"
                />
              </Flex>

              <Flex gap={8} wrap align="center">
                <FilterLabel locale={locale} minWidth={locale === 'zh' ? 52 : 80}>{t('events_page.filter_theme')}</FilterLabel>
                <Select
                  variant="filled"
                  className="filter-select"
                  suffixIcon={<ChevronDownIcon />}
                  value={themeId}
                  onChange={setThemeId}
                  options={themeOptions}
                  style={{ width: 240 }}
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('events_page.all_themes')}
                />
              </Flex>
            </Flex>

            {loading && (
              <Flex vertical gap={10}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </Flex>
            )}

            {error && !loading && (
              <div style={{ padding: 40, color: token.colorError }}>
                {locale === 'zh' ? '错误：' : 'Error: '}
                {error}
              </div>
            )}

            {!loading && !error && events.length === 0 && (
              <Empty
                description={t('events_page.empty')}
                style={{ padding: '60px 0' }}
              />
            )}

            {!loading && !error && events.length > 0 && (
              <Flex vertical gap={10}>
                {events.map((ev) => (
                  <EventCard key={ev.id} ev={ev} />
                ))}
              </Flex>
            )}

            <div ref={sentinelRef} style={{ height: 1 }} />

            {!loading && hasMore && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px 0',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'none',
                  color: token.colorTextQuaternary,
                }}
              >
                {loadingMore ? t('events_page.load_more_hint') : ''}
              </div>
            )}

            {!loading && !hasMore && events.length > 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px 0',
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'none',
                  color: token.colorTextQuaternary,
                }}
              >
                {t('events_page.end_of_list')}
              </div>
            )}
          </Content>
        </Layout>
      </div>
    </div>
  )
}
