'use client'

import { Col, Row, Space } from 'antd'
import { TopNarrativeCard } from './TopNarrativeCard'
import { getOngoingTop3 } from '@/lib/theme-priority'
import type { ThemeRadarItem } from '@/types/recommendations'

interface Props {
  themes: ThemeRadarItem[]
}

export function TodayTopNarratives({ themes }: Props) {
  const top3 = getOngoingTop3(themes)

  if (top3.length === 0) return null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {top3[0] && <TopNarrativeCard theme={top3[0]} rank={0} variant="hero" />}
      {top3.length > 1 && (
        <Row gutter={[16, 16]}>
          {top3[1] && (
            <Col xs={24} sm={12}>
              <TopNarrativeCard theme={top3[1]} rank={1} variant="compact" />
            </Col>
          )}
          {top3[2] && (
            <Col xs={24} sm={12}>
              <TopNarrativeCard theme={top3[2]} rank={2} variant="compact" />
            </Col>
          )}
        </Row>
      )}
    </Space>
  )
}
