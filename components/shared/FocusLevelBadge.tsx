'use client'

import React from 'react'
import { Tag } from 'antd'
import { FireFilled } from '@ant-design/icons'
import { useI18n } from '@/lib/i18n-context'

interface FocusLevelBadgeProps {
  strength: number | null | undefined
  size?: 'small' | 'default'
}

interface FocusLevel {
  labelKey: string
  color: string
  background: string
  icon: 'fire' | 'circle-filled' | 'circle-outlined'
}

function getFocusLevel(strength: number): FocusLevel {
  if (strength >= 85) {
    return { labelKey: 'focus.critical', color: '#8B3A2E', background: '#F5E8E3', icon: 'fire' }
  }
  if (strength >= 70) {
    return { labelKey: 'focus.high', color: '#8B5A00', background: '#FFF5E0', icon: 'fire' }
  }
  if (strength >= 50) {
    return { labelKey: 'focus.medium', color: '#5C6A1E', background: '#F0F2D8', icon: 'circle-filled' }
  }
  return { labelKey: 'focus.low', color: '#8C8A85', background: '#F5F5F0', icon: 'circle-outlined' }
}

export function FocusLevelBadge({ strength, size = 'default' }: FocusLevelBadgeProps) {
  const { t } = useI18n()
  if (strength == null) return null

  const level = getFocusLevel(strength)
  const isSmall = size === 'small'
  const dotSize = isSmall ? 6 : 8

  let iconNode: React.ReactNode = null
  if (level.icon === 'fire') {
    iconNode = <FireFilled style={{ color: level.color, fontSize: isSmall ? 10 : 12 }} />
  } else if (level.icon === 'circle-filled') {
    iconNode = (
      <span
        style={{
          display: 'inline-block',
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: level.color,
        }}
      />
    )
  } else {
    iconNode = (
      <span
        style={{
          display: 'inline-block',
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          border: `1.5px solid ${level.color}`,
          background: 'transparent',
        }}
      />
    )
  }

  return (
    <Tag
      style={{
        background: level.background,
        color: level.color,
        border: 'none',
        borderRadius: 4,
        padding: isSmall ? '1px 8px' : '3px 10px',
        fontSize: isSmall ? 11 : 12,
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        margin: 0,
        lineHeight: 1.5,
      }}
    >
      {iconNode}
      <span>{t(level.labelKey)}</span>
    </Tag>
  )
}
