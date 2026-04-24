'use client'

import { Col, Row } from 'antd'
import type { ThemeRadarItem } from '@/types/recommendations'
import { ThemeCard } from './ThemeCard'

interface SecondaryThemeGridProps {
  themes: ThemeRadarItem[]
}

export function SecondaryThemeGrid({ themes }: SecondaryThemeGridProps) {
  if (themes.length === 0) return null

  return (
    <Row gutter={[14, 14]}>
      {themes.map((th) => (
        <Col key={th.id} xs={24} sm={12} lg={6}>
          <ThemeCard theme={th} variant="secondary" />
        </Col>
      ))}
    </Row>
  )
}
