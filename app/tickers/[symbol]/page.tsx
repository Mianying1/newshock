'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import {
  Breadcrumb,
  Button,
  Empty,
  Grid,
  Input,
  Layout,
  Skeleton,
  Space,
  Typography,
  theme,
} from 'antd'
import {
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { HeroBlock } from '@/components/ticker-detail/HeroBlock'
import { NarrativeBlocks } from '@/components/ticker-detail/NarrativeBlocks'
import {
  ThemeCards,
  type ThemeCardItem,
} from '@/components/ticker-detail/ThemeCards'
import {
  AllThemesCollapsed,
  type AllThemesItem,
} from '@/components/ticker-detail/AllThemesCollapsed'
import {
  PlaybookTabs,
  type PlaybookData,
} from '@/components/ticker-detail/PlaybookTabs'
import { EventsList, type EventItem } from '@/components/ticker-detail/EventsList'
import '../../radar.css'

const { Text } = Typography
const { Header, Content } = Layout
const { useToken } = theme
const { useBreakpoint } = Grid

type NarrativeBlockShape = {
  hero_line: string | null
  top_themes: Array<{ theme_id: string; label: string; direction: string }> | null
  core_tension: string | null
  why_benefits: string | null
  risk_sources: string | null
}
type NarrativeApiResponse = {
  symbol: string
  locale: 'en' | 'zh'
  narrative: NarrativeBlockShape | null
  status: 'fresh' | 'stale_served' | 'no_active_themes' | 'unknown_ticker' | 'generated' | 'failed'
  generated_at: string | null
  model_version: string | null
  ticker: { company_name: string | null; sector: string | null } | null
  active_theme_count: number
}
async function narrativeFetcher(url: string): Promise<NarrativeApiResponse> {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok && r.status !== 404 && r.status !== 502) {
    throw new Error(`narrative_http_${r.status}`)
  }
  return (await r.json()) as NarrativeApiResponse
}

type DetailApiResponse =
  | {
      ok: true
      topThemes: ThemeCardItem[]
      allActive: AllThemesItem[]
      playbooks: PlaybookData[]
      events: EventItem[]
      scores: { short: number | null; long: number | null; potential: number | null }
      totals: { coreCount: number; activeCount: number }
    }
  | { ok: false; error: string }

async function detailFetcher(url: string): Promise<DetailApiResponse> {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok && r.status !== 500) {
    throw new Error(`detail_http_${r.status}`)
  }
  return (await r.json()) as DetailApiResponse
}

export default function TickerDetailPage() {
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const { mode, toggle } = useThemeMode()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const sidePad = isMobile ? 16 : 28

  const params = useParams<{ symbol: string }>()
  const symbol = params?.symbol?.toString().toUpperCase() ?? ''

  const narrativeKey = symbol ? `/api/tickers/${symbol}/narrative?locale=${locale}` : null
  const {
    data: narrativeResp,
    error: narrativeError,
    isLoading: narrativeLoading,
    mutate: refetchNarrative,
  } = useSWR<NarrativeApiResponse>(narrativeKey, narrativeFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const detailKey = symbol ? `/api/tickers/${symbol}/detail?locale=${locale}` : null
  const {
    data: detailResp,
    error: detailError,
    isLoading: detailLoading,
  } = useSWR<DetailApiResponse>(detailKey, detailFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const detail = detailResp?.ok ? detailResp : null

  // Case — ticker has no active themes anywhere.
  if (narrativeResp?.status === 'no_active_themes') {
    return (
      <PageShell symbol={symbol} sidePad={sidePad} mode={mode} toggle={toggle} setLocale={setLocale} locale={locale} t={t} token={token}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, marginBottom: 4 }}>
                {locale === 'zh' ? `${symbol} · 暂无活跃主题` : `${symbol} · No active themes`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {locale === 'zh' ? '该 ticker 当前未关联任何活跃主题' : 'This ticker is not linked to any active theme'}
              </div>
            </div>
          }
        >
          <Link href="/tickers">
            <Button type="primary">{locale === 'zh' ? '返回列表' : 'Back to list'}</Button>
          </Link>
        </Empty>
      </PageShell>
    )
  }

  if (narrativeResp?.status === 'unknown_ticker') {
    return (
      <PageShell symbol={symbol} sidePad={sidePad} mode={mode} toggle={toggle} setLocale={setLocale} locale={locale} t={t} token={token}>
        <Empty description={locale === 'zh' ? `未找到 ticker ${symbol}` : `Ticker ${symbol} not found`}>
          <Link href="/tickers">
            <Button type="primary">{locale === 'zh' ? '返回列表' : 'Back to list'}</Button>
          </Link>
        </Empty>
      </PageShell>
    )
  }

  // Section 03 page-level empty — detail loaded with no active themes at all.
  if (detail && detail.totals.activeCount === 0 && !detailLoading && narrativeResp) {
    return (
      <PageShell symbol={symbol} sidePad={sidePad} mode={mode} toggle={toggle} setLocale={setLocale} locale={locale} t={t} token={token}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={locale === 'zh' ? `${symbol} · 暂无活跃主题` : `${symbol} · No active themes`}
        >
          <Link href="/tickers">
            <Button type="primary">{locale === 'zh' ? '返回列表' : 'Back to list'}</Button>
          </Link>
        </Empty>
      </PageShell>
    )
  }

  const tierLabels = {
    tier1: t('ticker_detail.tier_1'),
    tier2: t('ticker_detail.tier_2'),
    tier3: t('ticker_detail.tier_3'),
  }
  const directionLabels = {
    directionBenefits: t('theme_detail.direction_benefits'),
    directionHeadwind: t('theme_detail.direction_headwind'),
    directionMixed: t('theme_detail.direction_mixed'),
    directionUncertain: t('theme_detail.direction_uncertain'),
  }

  const heroThemes =
    detail?.topThemes.map((th) => ({
      themeId: th.fullThemeId ?? th.themeId,
      label: th.label,
      direction: th.exposureDirection ?? 'uncertain',
    })) ??
    (narrativeResp?.narrative?.top_themes ?? []).map((tt) => ({
      themeId: tt.theme_id,
      label: tt.label,
      direction: tt.direction,
    }))

  return (
    <PageShell symbol={symbol} sidePad={sidePad} mode={mode} toggle={toggle} setLocale={setLocale} locale={locale} t={t} token={token}>
      <HeroBlock
        symbol={symbol}
        companyName={narrativeResp?.ticker?.company_name ?? null}
        sector={narrativeResp?.ticker?.sector ?? null}
        shortScore={detail?.scores.short ?? null}
        longScore={detail?.scores.long ?? null}
        potentialScore={detail?.scores.potential ?? null}
        heroLine={narrativeResp?.narrative?.hero_line ?? null}
        themes={heroThemes}
        heroLabels={{
          short: t('ticker_detail.short_score'),
          long: t('ticker_detail.long_score'),
          potential: t('ticker_detail.potential_score'),
        }}
        scoreTooltips={{
          short: t('ticker_detail.short_score_tooltip'),
          long: t('ticker_detail.long_score_tooltip'),
          potential: t('ticker_detail.potential_score_tooltip'),
        }}
      />

      {/* 02 · Core Narrative */}
      <SectionHeader
        first
        title={t('ticker_detail.section_narrative_title')}
        subtitle={t('ticker_detail.section_narrative_subtitle')}
      />
      <NarrativeSection
        loading={narrativeLoading}
        failed={
          Boolean(narrativeError) ||
          narrativeResp?.status === 'failed' ||
          (narrativeResp != null && !narrativeResp.narrative)
        }
        narrative={narrativeResp?.narrative ?? null}
        labels={{
          coreTension: t('ticker_detail.core_tension'),
          whyBenefits: t('ticker_detail.why_benefits'),
          riskSources: t('ticker_detail.risk_sources'),
          unavailable: locale === 'zh' ? '分析暂不可用' : 'Analysis temporarily unavailable',
          retry: locale === 'zh' ? '重试' : 'Retry',
        }}
        token={token}
        onRetry={() => refetchNarrative()}
      />

      {/* 03 · Theme Drivers */}
      <SectionHeader
        title={t('ticker_detail.section_themes_title')}
        subtitle={
          detail
            ? t('ticker_detail.section_themes_subtitle', {
                n: detail.topThemes.length,
                total: detail.totals.activeCount,
              })
            : ''
        }
      />
      <ThemesSection
        loading={detailLoading}
        failed={Boolean(detailError) || (detailResp?.ok === false)}
        topThemes={detail?.topThemes ?? []}
        allActive={detail?.allActive ?? []}
        labels={{
          exposure: t('ticker_detail.exposure_zh'),
          events: t('ticker_detail.events_count'),
          expected: t('ticker_detail.expected_zh'),
          ...tierLabels,
          ...directionLabels,
          allToggle: t('ticker_detail.all_themes_toggle'),
          allSummary: t('ticker_detail.all_themes_summary'),
          daysShort: t('ticker_detail.days_unit'),
          unavailable: locale === 'zh' ? '主题数据暂不可用' : 'Theme data unavailable',
        }}
        token={token}
      />

      {/* 04 · Investment Playbook */}
      <SectionHeader
        title={t('ticker_detail.section_playbook_title')}
        subtitle={t('ticker_detail.section_playbook_subtitle')}
      />
      <PlaybookSection
        loading={detailLoading}
        playbooks={detail?.playbooks ?? []}
        labels={{
          observation: t('ticker_detail.this_time_observation'),
          historicalCases: t('ticker_detail.historical_cases_section'),
          exitSignals: t('ticker_detail.exit_signals_section'),
          empty: locale === 'zh' ? 'Playbook 准备中' : 'Playbook coming soon',
        }}
        token={token}
      />

      {/* 05 · Recent Events */}
      <SectionHeader
        title={t('ticker_detail.section_events_title')}
        subtitle={
          detail
            ? t('ticker_detail.section_events_subtitle', { n: detail.events.length })
            : ''
        }
      />
      <EventsSection
        loading={detailLoading}
        events={detail?.events ?? []}
        isDark={mode === 'dark'}
        labels={{
          showAll: t('ticker_detail.show_all_events_zh'),
          collapse: t('ticker_detail.collapse'),
          today: t('relative_time.just_now'),
          hoursAgo: t('relative_time.hours_ago'),
          daysAgo: t('relative_time.days_ago'),
          weeksAgo: t('relative_time.weeks_ago'),
          impactHigh: t('ticker_detail.impact_high'),
          impactMedium: t('ticker_detail.impact_medium'),
          impactLow: t('ticker_detail.impact_low'),
          linkedTheme: t('events_page.linked_theme'),
          empty: locale === 'zh' ? '近期无重大事件' : 'No recent significant events',
        }}
        token={token}
      />

      <Text
        style={{
          display: 'block',
          marginTop: 24,
          fontSize: 11,
          color: token.colorTextQuaternary,
          textAlign: 'center',
        }}
      >
        {t('common.disclaimer_footer')}
      </Text>
    </PageShell>
  )
}

// ─── Section components ─────────────────────────────────────────────────────

function NarrativeSection({
  loading,
  failed,
  narrative,
  labels,
  token,
  onRetry,
}: {
  loading: boolean
  failed: boolean
  narrative: NarrativeBlockShape | null
  labels: { coreTension: string; whyBenefits: string; riskSources: string; unavailable: string; retry: string }
  token: ReturnType<typeof useToken>['token']
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div style={{ marginTop: 12 }}>
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    )
  }
  if (failed || !narrative) {
    return <PlaceholderBox token={token} text={labels.unavailable} action={{ text: labels.retry, onClick: onRetry }} />
  }
  return (
    <NarrativeBlocks
      coreTension={narrative.core_tension ?? '—'}
      whyBenefits={narrative.why_benefits ?? '—'}
      riskSources={narrative.risk_sources ?? '—'}
      labels={{
        coreTension: labels.coreTension,
        whyBenefits: labels.whyBenefits,
        riskSources: labels.riskSources,
      }}
    />
  )
}

function ThemesSection({
  loading,
  failed,
  topThemes,
  allActive,
  labels,
  token,
}: {
  loading: boolean
  failed: boolean
  topThemes: ThemeCardItem[]
  allActive: AllThemesItem[]
  labels: {
    exposure: string
    events: string
    expected: string
    tier1: string
    tier2: string
    tier3: string
    directionBenefits: string
    directionHeadwind: string
    directionMixed: string
    directionUncertain: string
    allToggle: string
    allSummary: string
    daysShort: string
    unavailable: string
  }
  token: ReturnType<typeof useToken>['token']
}) {
  if (loading) {
    return (
      <div style={{ marginTop: 12 }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    )
  }
  if (failed) {
    return <PlaceholderBox token={token} text={labels.unavailable} />
  }
  return (
    <>
      <ThemeCards
        items={topThemes}
        labels={{
          exposure: labels.exposure,
          events: labels.events,
          expected: labels.expected,
          tier1: labels.tier1,
          tier2: labels.tier2,
          tier3: labels.tier3,
          directionBenefits: labels.directionBenefits,
          directionHeadwind: labels.directionHeadwind,
          directionMixed: labels.directionMixed,
          directionUncertain: labels.directionUncertain,
        }}
      />
      <AllThemesCollapsed
        items={allActive}
        labels={{
          toggle: labels.allToggle,
          summary: labels.allSummary,
          daysShort: labels.daysShort,
          tier1: labels.tier1,
          tier2: labels.tier2,
          tier3: labels.tier3,
          directionBenefits: labels.directionBenefits,
          directionHeadwind: labels.directionHeadwind,
          directionMixed: labels.directionMixed,
          directionUncertain: labels.directionUncertain,
        }}
      />
    </>
  )
}

function PlaybookSection({
  loading,
  playbooks,
  labels,
  token,
}: {
  loading: boolean
  playbooks: PlaybookData[]
  labels: { observation: string; historicalCases: string; exitSignals: string; empty: string }
  token: ReturnType<typeof useToken>['token']
}) {
  if (loading) {
    return (
      <div style={{ marginTop: 12 }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    )
  }
  if (playbooks.length === 0) {
    return <PlaceholderBox token={token} text={labels.empty} />
  }
  return (
    <PlaybookTabs
      playbooks={playbooks}
      labels={{
        observation: labels.observation,
        historicalCases: labels.historicalCases,
        exitSignals: labels.exitSignals,
      }}
    />
  )
}

function EventsSection({
  loading,
  events,
  isDark,
  labels,
  token,
}: {
  loading: boolean
  events: EventItem[]
  isDark: boolean
  labels: {
    showAll: string
    collapse: string
    today: string
    hoursAgo: string
    daysAgo: string
    weeksAgo: string
    impactHigh: string
    impactMedium: string
    impactLow: string
    linkedTheme: string
    empty: string
  }
  token: ReturnType<typeof useToken>['token']
}) {
  if (loading) {
    return (
      <div style={{ marginTop: 12 }}>
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    )
  }
  if (events.length === 0) {
    return <PlaceholderBox token={token} text={labels.empty} />
  }
  return (
    <EventsList
      items={events}
      isDark={isDark}
      labels={{
        showAll: labels.showAll,
        collapse: labels.collapse,
        today: labels.today,
        hoursAgo: labels.hoursAgo,
        daysAgo: labels.daysAgo,
        weeksAgo: labels.weeksAgo,
        impactHigh: labels.impactHigh,
        impactMedium: labels.impactMedium,
        impactLow: labels.impactLow,
        linkedTheme: labels.linkedTheme,
      }}
    />
  )
}

function PlaceholderBox({
  token,
  text,
  action,
}: {
  token: ReturnType<typeof useToken>['token']
  text: string
  action?: { text: string; onClick: () => void }
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 24,
        border: `1px dashed ${token.colorBorder}`,
        borderRadius: token.borderRadius,
        textAlign: 'center',
        color: token.colorTextSecondary,
      }}
    >
      <div style={{ fontSize: 13, marginBottom: action ? 8 : 0 }}>{text}</div>
      {action && (
        <Button size="small" onClick={action.onClick}>
          {action.text}
        </Button>
      )}
    </div>
  )
}

// ─── Page shell ─────────────────────────────────────────────────────────────

function PageShell({
  symbol,
  sidePad,
  mode,
  toggle,
  setLocale,
  locale,
  t,
  token,
  children,
}: {
  symbol: string
  sidePad: number
  mode: 'light' | 'dark'
  toggle: () => void
  setLocale: (l: 'en' | 'zh') => void
  locale: 'en' | 'zh'
  t: (k: string, vars?: Record<string, string | number>) => string
  token: ReturnType<typeof useToken>['token']
  children: React.ReactNode
}) {
  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <Layout style={{ background: 'transparent' }}>
          <Topbar sidePad={sidePad} />

          <Content style={{ padding: `0 ${sidePad}px 40px`, minWidth: 0 }}>
            <Breadcrumb
              style={{ margin: '20px 0 4px', fontSize: 12 }}
              items={[
                { title: <Link href="/">{t('sidebar.radar')}</Link> },
                { title: <Link href="/tickers">{t('sidebar.tickers')}</Link> },
                { title: symbol },
              ]}
            />
            {children}
          </Content>
        </Layout>
      </div>
    </div>
  )
}
