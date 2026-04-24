'use client'

import React from 'react'
import { Tag, theme } from 'antd'
import { useI18n } from '@/lib/i18n-context'

interface HorizonBadgeProps {
  typicalDurationDaysUpper?: number | null
}

type Horizon = 'short' | 'medium' | 'long'

function getHorizon(days: number | null | undefined): Horizon {
  if (days == null || days <= 0) return 'medium'
  if (days < 180) return 'short'
  if (days >= 730) return 'long'
  return 'medium'
}

const LABEL_KEY: Record<Horizon, string> = {
  short: 'horizon.short',
  medium: 'horizon.medium',
  long: 'horizon.long',
}

export function HorizonBadge({ typicalDurationDaysUpper }: HorizonBadgeProps) {
  const { t } = useI18n()
  const { token } = theme.useToken()
  const horizon = getHorizon(typicalDurationDaysUpper)

  return (
    <Tag
      style={{
        background: token.colorFillAlter,
        color: token.colorTextSecondary,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: 4,
        padding: '2px 10px',
        fontSize: 12,
        fontWeight: 500,
        margin: 0,
        lineHeight: 1.5,
      }}
    >
      {t(LABEL_KEY[horizon])}
    </Tag>
  )
}
