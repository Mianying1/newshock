'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  Badge,
  Button,
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
import { SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { Sidebar } from '@/components/Sidebar'
import { MarketRegimeCard } from '@/components/MarketRegimeCard'
import { MarketNarratives } from '@/components/MarketNarratives'
import { TopTickersSection } from '@/components/TopTickersSection'
import { EventStream } from '@/components/EventStream'
import { ActiveThemeCard } from '@/components/ActiveThemeCard'
import StageAlertsSection from '@/components/StageAlertsSection'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { CuratorStrip } from '@/components/shared/CuratorStrip'
import { useI18n } from '@/lib/i18n-context'
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
  const umbrellaThemes = activeThemes.filter((th) => th.theme_tier === 'umbrella')
  const subthemes = activeThemes.filter((th) => th.theme_tier !== 'umbrella')
  const totalThemes = activeThemes.length
  const visibleThemes = activeThemes.slice(0, 12)
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
              value={locale}
              onChange={(v) => setLocale(v as 'en' | 'zh')}
              options={[
                { label: 'EN', value: 'en' },
                { label: '中', value: 'zh' },
              ]}
            />
            <Button type="text" icon={<SettingOutlined />} aria-label="Settings" />
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

            <MarketRegimeCard />
            <StageAlertsSection />
            <TopTickersSection />
            <MarketNarratives />
            <EventStream />

            <SectionLabel
              label={t('active_themes.core_title')}
              extra={t('active_themes.showing', { n: umbrellaThemes.length })}
            />

            {loading && (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <Spin />
              </div>
            )}
            {error && (
              <Empty
                description={t('common.error')}
                style={{ padding: '40px 0' }}
              />
            )}
            {!loading && !error && visibleThemes.length === 0 && (
              <Empty
                description={t('common.no_themes')}
                style={{ padding: '40px 0' }}
              />
            )}

            {umbrellaThemes.length > 0 && (
              <Row gutter={[14, 14]}>
                {umbrellaThemes.map((th) => (
                  <Col key={th.id} xs={24} md={12}>
                    <ActiveThemeCard theme={th} />
                  </Col>
                ))}
              </Row>
            )}

            {subthemes.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <SectionLabel
                  label={t('active_themes.subtheme_title')}
                  extra={t('active_themes.showing', { n: subthemes.length })}
                />
                <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
                  <Link href="/themes?tier=subtheme" style={{ textDecoration: 'none' }}>
                    <Button shape="round">
                      {t('active_themes.expand_subthemes', { count: subthemes.length })}
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <CuratorStrip
              initials="MC"
              name="Mianying Chen"
              role={t('curator_strip.role')}
              byLabel={t('curator_strip.by')}
              disclaim={t('curator_strip.disclaim')}
            />
          </Content>
        </Layout>
      </div>
    </div>
  )
}
