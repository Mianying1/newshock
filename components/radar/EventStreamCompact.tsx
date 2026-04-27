'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import {
  Button,
  Card,
  Dropdown,
  Empty,
  Flex,
  Spin,
  Tag,
  Typography,
  theme,
} from 'antd'
import { EllipsisOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { getDisplayPublisher } from '@/lib/source-display'
import { formatRelativeTime } from '@/lib/utils'
import { SectionTitle } from '@/components/shared/SectionTitle'
import { SectionHeader } from '@/components/shared/SectionHeader'

const { Text } = Typography
const { useToken } = theme

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface StreamEvent {
  id: string
  headline: string
  headline_zh: string | null
  source_name: string | null
  source_url: string | null
  event_date: string
  theme_id: string | null
  theme_name: string | null
  theme_name_zh: string | null
  theme_status: string | null
}

interface StreamResponse {
  events: StreamEvent[]
  unmatched_count: number
  matched_count: number
  limit: number
  mode: 'matched' | 'unmatched' | 'all'
}

type StreamMode = 'matched' | 'unmatched' | 'noise'

const SRC_COLOR: Record<string, { bg: string; fg: string }> = {
  Reuters:           { bg: '#FFEDD5', fg: '#C2410C' },
  Bloomberg:         { bg: '#D1FAE5', fg: '#047857' },
  WSJ:               { bg: '#EDE9FE', fg: '#6D28D9' },
  'Financial Times': { bg: '#FCE7F3', fg: '#BE185D' },
  CNBC:              { bg: '#E0F2FE', fg: '#0369A1' },
  NYT:               { bg: '#F4F4F5', fg: '#3F3F46' },
}

function shortPublisher(name: string): string {
  if (name === 'Financial Times') return 'FT'
  if (name === 'Nikkei Asia') return 'Nikkei'
  if (name === "Investor's Business Daily") return 'IBD'
  if (name === 'GlobeNewswire') return 'Globe'
  if (name === 'PR Newswire') return 'PRNews'
  if (name === 'BusinessWire') return 'BizWire'
  if (name.length > 10) return name.split(/\s+/)[0].slice(0, 10)
  return name
}

function buildUrl(mode: StreamMode): string {
  if (mode === 'noise') return '/api/events/recent?limit=6&mode=all&noise=1'
  return `/api/events/recent?limit=6&mode=${mode}`
}

interface EventStreamCompactProps {
  headerless?: boolean
  section?: {
    title: ReactNode
    subtitle?: ReactNode
    size?: 'lg' | 'sm'
    first?: boolean
  }
}

export function EventStreamCompact({ headerless = false, section }: EventStreamCompactProps = {}) {
  const { t, locale } = useI18n()
  const { token } = useToken()
  const [mode, setMode] = useState<StreamMode>('matched')
  const { data, error, isLoading } = useSWR<StreamResponse>(buildUrl(mode), fetcher)

  const events = data?.events ?? []
  const unmatched = data?.unmatched_count ?? 0
  const isEmpty = !isLoading && !error && events.length === 0

  const menuItems: MenuProps['items'] = [
    { key: 'matched', label: t('event_stream.show_matched') },
    { key: 'unmatched', label: t('event_stream.show_unmatched', { n: unmatched }) },
    { key: 'noise', label: t('event_stream.show_noise') },
  ]

  const titleNode = (headerless || section) ? undefined : <SectionTitle>{t('event_stream.title')}</SectionTitle>

  const extraNode = (
    <Dropdown
      menu={{
        items: menuItems,
        selectable: true,
        selectedKeys: [mode],
        onClick: ({ key }) => setMode(key as StreamMode),
      }}
      trigger={['click']}
    >
      <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label="Stream options" />
    </Dropdown>
  )

  const card = (
    <Card size="small" title={titleNode} extra={section ? undefined : extraNode} styles={{ body: { padding: 0 } }}>
      {isLoading && (
        <Flex justify="center" style={{ padding: 24 }}>
          <Spin size="small" />
        </Flex>
      )}
      {error && !isLoading && (
        <Empty description={t('event_stream.error')} style={{ padding: 24 }} />
      )}
      {isEmpty && (
        <Empty description={t('event_stream.no_events')} style={{ padding: 24 }} />
      )}
      {!isLoading && !error && events.length > 0 &&
        events.map((e, idx) => {
          const publisher = getDisplayPublisher(e.source_name, e.source_url)
          const srcColors = SRC_COLOR[publisher]
          const themeName = pickField(locale, e.theme_name, e.theme_name_zh)
          const headline = pickField(locale, e.headline, e.headline_zh)
          const timeAgo = formatRelativeTime(e.event_date, t, locale)

          return (
            <Flex
              vertical
              key={e.id}
              gap={6}
              style={{
                padding: '12px 14px',
                borderTop: idx === 0 ? 'none' : `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Flex align="center" gap={8}>
                <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 10.5, color: token.colorTextTertiary }}>
                  {timeAgo}
                </Text>
                <Tag
                  style={{
                    fontFamily: token.fontFamilyCode,
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'none',
                    margin: 0,
                    background: srcColors?.bg ?? token.colorFillTertiary,
                    color: srcColors?.fg ?? token.colorTextSecondary,
                    borderColor: 'transparent',
                  }}
                >
                  {shortPublisher(publisher)}
                </Tag>
              </Flex>
              {e.source_url ? (
                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: token.colorText, fontSize: 12.5, lineHeight: 1.4, textDecoration: 'none' }}
                >
                  {headline}
                </a>
              ) : (
                <Text style={{ color: token.colorText, fontSize: 12.5, lineHeight: 1.4 }}>{headline}</Text>
              )}
              {e.theme_id && themeName ? (
                <Link
                  href={`/themes/${e.theme_id}`}
                  style={{ color: token.colorPrimary, fontSize: 11, textDecoration: 'none' }}
                >
                  → {themeName}
                </Link>
              ) : (
                <Text style={{ color: token.colorTextQuaternary, fontSize: 11 }}>
                  {t('event_stream.no_theme_match')}
                </Text>
              )}
            </Flex>
          )
        })
      }
    </Card>
  )

  if (!section) return card

  return (
    <>
      <SectionHeader
        title={section.title}
        subtitle={section.subtitle}
        size={section.size}
        first={section.first}
        action={extraNode}
      />
      {card}
    </>
  )
}
