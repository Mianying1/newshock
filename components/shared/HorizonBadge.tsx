'use client'

import React from 'react'
import { Tag } from 'antd'
import { useI18n } from '@/lib/i18n-context'

interface HorizonBadgeProps {
  typicalDurationDaysUpper?: number | null
  size?: 'small' | 'default'
}

type Horizon = 'short' | 'medium' | 'long'

function getHorizon(days: number | null | undefined): Horizon {
  if (days == null || days <= 0) return 'medium'
  if (days < 180) return 'short'
  if (days >= 730) return 'long'
  return 'medium'
}

const STYLES: Record<Horizon, { bg: string; color: string; labelKey: string }> = {
  short: { bg: '#F5E8E3', color: '#8B3A2E', labelKey: 'horizon.short' },
  medium: { bg: '#FFF5E0', color: '#8B5A00', labelKey: 'horizon.medium' },
  long: { bg: '#F0F2D8', color: '#5C6A1E', labelKey: 'horizon.long' },
}

export function HorizonBadge({ typicalDurationDaysUpper, size = 'default' }: HorizonBadgeProps) {
  const { t } = useI18n()
  const horizon = getHorizon(typicalDurationDaysUpper)
  const style = STYLES[horizon]
  const isSmall = size === 'small'

  return (
    <Tag
      style={{
        background: style.bg,
        color: style.color,
        border: 'none',
        borderRadius: 4,
        padding: isSmall ? '1px 8px' : '2px 10px',
        fontSize: isSmall ? 11 : 12,
        margin: 0,
        lineHeight: 1.5,
      }}
    >
      {t(style.labelKey)}
    </Tag>
  )
}
