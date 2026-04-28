'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import {
  Button,
  Card,
  Col,
  Empty,
  Grid,
  Input,
  Layout,
  Row,
  Space,
  Typography,
  theme,
} from 'antd'
import { MoonOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { MarketRegimeCard } from '@/components/MarketRegimeCard'
import { TopTickersSection } from '@/components/TopTickersSection'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { PageHeader } from '@/components/shared/PageHeader'
import { RadarIcon } from '@/components/shared/NavIcons'
import { TodayTopNarratives } from '@/components/radar/TodayTopNarratives'
import { LatestThemes } from '@/components/radar/LatestThemes'
import { EventStreamCompact } from '@/components/radar/EventStreamCompact'
import { NarrativeSectionSkeleton } from '@/components/skeleton'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import { getOngoingTop3 } from '@/lib/theme-priority'
import type { ThemeRadarItem } from '@/types/recommendations'
import './radar.css'

const { Text } = Typography
const { Header, Content } = Layout
const { useToken } = theme
const { useBreakpoint } = Grid

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Overview {
  active_count: number
  cooling_count: number
  events_7d: number
}

export default function HomePage() {
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const { mode, toggle } = useThemeMode()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const sidePad = isMobile ? 16 : 28
  const [themes, setThemes] = useState<ThemeRadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const { data: overview } = useSWR<Overview>('/api/meta/overview', fetcher, {
    refreshInterval: 60_000,
  })

  useEffect(() => {
    fetch('/api/themes')
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
  }, [])

  const activeThemes = themes.filter((th) => th.status !== 'archived')
  const totalThemes = activeThemes.length

  const top3Ids = new Set(getOngoingTop3(activeThemes).map((th) => th.id))

  const eventsWeek = overview?.events_7d ?? 0

  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <Layout style={{ background: 'transparent' }}>
          <Topbar sidePad={sidePad} />

          <Content style={{ padding: `0 ${sidePad}px 40px`, minWidth: 0 }}>
            <PageHeader
              title={t('sidebar.radar')}
              icon={<RadarIcon />}
              stats={[
                { value: totalThemes, label: locale === 'zh' ? '主题' : 'Themes' },
                { value: eventsWeek, label: locale === 'zh' ? '事件 / 一周' : 'Events / 1w' },
              ]}
            />

            <Row gutter={[24, 24]} style={{ marginTop: 8 }}>
              <Col xs={24} lg={17}>
                {loading && <NarrativeSectionSkeleton count={3} />}
                {error && (
                  <Empty description={t('common.error')} style={{ padding: '40px 0' }} />
                )}
                {!loading && !error && totalThemes === 0 && (
                  <Empty description={t('common.no_themes')} style={{ padding: '40px 0' }} />
                )}

                {!loading && !error && activeThemes.length > 0 && (
                  <>
                    <SectionHeader
                      first
                      title={t('sections.ongoing_narratives_title')}
                      subtitle={t('sections.ongoing_narratives_subtitle')}
                    />
                    <TodayTopNarratives themes={activeThemes} />
                  </>
                )}

                {!loading && !error && activeThemes.length > 0 && (
                  <>
                    <SectionHeader
                      title={t('sections.latest_themes_title')}
                      subtitle={t('sections.latest_themes_subtitle')}
                    />
                    <LatestThemes
                      themes={activeThemes}
                      excludeIds={top3Ids}
                      totalThemeCount={totalThemes}
                    />
                  </>
                )}

                <SectionHeader
                  title={t('sections.stock_picks_title')}
                  subtitle={t('sections.stock_picks_subtitle')}
                />
                <TopTickersSection />
              </Col>
              <Col xs={24} lg={7}>
                <div style={{ position: 'sticky', top: 80 }}>
                  <SectionHeader
                    first
                    title={t('sections.market_regime_title')}
                    subtitle={t('sections.market_regime_subtitle')}
                  />
                  <Card size="small">
                    <MarketRegimeCard />
                  </Card>

                  <EventStreamCompact
                    section={{
                      title: t('sections.event_stream_title'),
                      subtitle: t('sections.event_stream_subtitle'),
                    }}
                  />
                </div>
              </Col>
            </Row>
          </Content>
        </Layout>
      </div>
    </div>
  )
}
