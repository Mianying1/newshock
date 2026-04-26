'use client'

import Link from 'next/link'
import { Col, Flex, Row, theme } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { ThemeCard } from './ThemeCard'
import { useI18n } from '@/lib/i18n-context'
import type { ThemeRadarItem } from '@/types/recommendations'

const { useToken } = theme

interface Props {
  themes: ThemeRadarItem[]
  excludeIds: Set<string>
  totalThemeCount: number
}

const LATEST_LIMIT = 9

export function LatestThemes({ themes, excludeIds, totalThemeCount }: Props) {
  const { t } = useI18n()
  const { token } = useToken()

  const latest = themes
    .filter((th) => !excludeIds.has(th.id))
    .filter((th) => th.status === 'active' || th.status === 'cooling')
    .slice()
    .sort((a, b) => {
      const ta = a.latest_event_date ? new Date(a.latest_event_date).getTime() : 0
      const tb = b.latest_event_date ? new Date(b.latest_event_date).getTime() : 0
      return tb - ta
    })
    .slice(0, LATEST_LIMIT)

  if (latest.length === 0) return null

  return (
    <div>
      <Row gutter={[14, 14]}>
        {latest.map((th) => (
          <Col key={th.id} xs={24} sm={12} lg={8}>
            <ThemeCard theme={th} variant="secondary" />
          </Col>
        ))}
      </Row>

      <Flex justify="center" style={{ marginTop: 20 }}>
        <Link
          href="/themes"
          className="latest-themes-cta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 38,
            padding: '0 22px',
            fontSize: 13,
            fontWeight: 500,
            color: token.colorBgContainer,
            background: token.colorText,
            border: `1px solid ${token.colorText}`,
            borderRadius: 999,
            textDecoration: 'none',
            transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
            boxShadow: token.boxShadowTertiary,
          }}
        >
          <span>{t('sections.latest_themes_view_all', { n: totalThemeCount })}</span>
          <ArrowRightOutlined style={{ fontSize: 11 }} />
        </Link>
      </Flex>
    </div>
  )
}
