'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Layout,
  Row,
  Segmented,
  Space,
  Spin,
  Typography,
  theme,
} from 'antd'
import Link from 'next/link'
import { SearchOutlined } from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { MarketRegimeCard } from '@/components/MarketRegimeCard'
import { TopTickersSection } from '@/components/TopTickersSection'
import { SectionHeader } from '@/components/shared/SectionHeader'
import { TodayTopNarratives } from '@/components/radar/TodayTopNarratives'
import { SecondaryThemeGrid } from '@/components/radar/SecondaryThemeGrid'
import { EventStreamCompact } from '@/components/radar/EventStreamCompact'
import { useI18n } from '@/lib/i18n-context'
import { getTodayPriority } from '@/lib/theme-priority'
import type { ThemeRadarItem } from '@/types/recommendations'
import './radar.css'

const { Title, Text } = Typography
const { Header, Content } = Layout
const { useToken } = theme

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Overview {
  active_count: number
  cooling_count: number
  narratives_count: number
  events_7d: number
}

function useHeaderDate(locale: 'en' | 'zh') {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (locale === 'zh') {
      const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
      setLabel(`${weekday} · ${d.getMonth() + 1}月${d.getDate()}日 · ${hh}:${mm}`)
    } else {
      const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
      setLabel(`${weekday} · ${month} ${d.getDate()} · ${hh}:${mm}`)
    }
  }, [locale])
  return label
}

export default function HomePage() {
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
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

  const top3Ids = new Set(
    activeThemes
      .filter((th) => th.status === 'active')
      .sort((a, b) => getTodayPriority(b) - getTodayPriority(a))
      .slice(0, 3)
      .map((th) => th.id),
  )

  const secondaryThemes = activeThemes
    .filter((th) => !top3Ids.has(th.id))
    .sort((a, b) => b.theme_strength_score - a.theme_strength_score)
    .slice(0, 8)

  const narrativesCount = overview?.narratives_count ?? 0
  const eventsWeek = overview?.events_7d ?? 0
  const headerDate = useHeaderDate(locale)

  return (
    <div className="radar-page">
      <div className="app">
        <Sidebar />
        <Layout style={{ background: 'transparent' }}>
          <Header
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              height: 52,
              padding: '10px 28px',
              background: 'rgba(244, 241, 236, 0.78)',
              backdropFilter: 'saturate(160%) blur(16px)',
              WebkitBackdropFilter: 'saturate(160%) blur(16px)',
              borderBottom: `1px solid ${token.colorBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Input
              disabled
              prefix={<SearchOutlined />}
              placeholder={t('topbar.search_placeholder')}
              suffix={
                <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: token.colorTextQuaternary }}>
                  {t('topbar.search_soon')}
                </Text>
              }
              style={{ flex: 1 }}
            />
            <Segmented
              size="small"
              value={locale}
              onChange={(v) => setLocale(v as 'en' | 'zh')}
              options={[
                { label: 'EN', value: 'en' },
                { label: '中', value: 'zh' },
              ]}
            />
          </Header>

          <Content style={{ padding: '0 28px 40px' }}>
            <div style={{ padding: '34px 2px 8px' }}>
              <Title
                level={1}
                style={{
                  margin: 0,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                }}
              >
                {t('radar.today_on_radar')}
              </Title>
              <Space size={10} wrap style={{ marginTop: 8, fontSize: 12.5, color: token.colorTextTertiary }}>
                {headerDate && <Text style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>{headerDate}</Text>}
                {headerDate && <Text style={{ color: token.colorTextQuaternary }}>·</Text>}
                <Badge color={token.colorSuccess} />
                <Text style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>{t('radar.narratives_count', { n: narrativesCount })}</Text>
                <Text style={{ color: token.colorTextQuaternary }}>·</Text>
                <Text style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>{t('radar.active_themes_count', { n: totalThemes })}</Text>
                <Text style={{ color: token.colorTextQuaternary }}>·</Text>
                <Text style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>{t('radar.events_scanned_7d', { n: eventsWeek })}</Text>
              </Space>
            </div>

            <Row gutter={[24, 24]} style={{ marginTop: 8 }}>
              <Col xs={24} lg={17}>
                {loading && (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <Spin />
                  </div>
                )}
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
                      index="01"
                      title={t('sections.top_narratives_title')}
                      subtitle={t('sections.top_narratives_subtitle')}
                      meta={t('sections.top_narratives_meta', { n: top3Ids.size })}
                    />
                    <TodayTopNarratives themes={activeThemes} />
                  </>
                )}

                <SectionHeader
                  index="02"
                  title={t('sections.stock_picks_title')}
                  subtitle={t('sections.stock_picks_subtitle')}
                />
                <TopTickersSection />

                {!loading && !error && secondaryThemes.length > 0 && (
                  <>
                    <SectionHeader
                      index="03"
                      title={t('sections.themes_title')}
                      subtitle={t('sections.themes_subtitle')}
                      meta={t('sections.themes_meta', { n: secondaryThemes.length })}
                      action={
                        <Link href="/themes" style={{ textDecoration: 'none' }}>
                          <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}>
                            {t('sections.themes_view_all')}
                          </Button>
                        </Link>
                      }
                    />
                    <Card size="small">
                      <SecondaryThemeGrid themes={secondaryThemes} />
                    </Card>
                  </>
                )}
              </Col>
              <Col xs={24} lg={7}>
                <div style={{ position: 'sticky', top: 80 }}>
                  <SectionHeader
                    first
                    size="sm"
                    index="01"
                    title={t('sections.market_regime_title')}
                    subtitle={t('sections.market_regime_subtitle')}
                    meta={t('market_regime.scores_refresh_twice_weekly')}
                  />
                  <Card size="small">
                    <MarketRegimeCard />
                  </Card>

                  <EventStreamCompact
                    section={{
                      size: 'sm',
                      index: '02',
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
