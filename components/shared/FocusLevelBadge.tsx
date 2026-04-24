'use client'

import React from 'react'
import { Tag } from 'antd'
import { FireFilled } from '@ant-design/icons'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'

interface FocusLevelBadgeProps {
  strength: number | null | undefined
}

interface FocusLevel {
  labelKey: string
  color: string
  background: string
  icon: 'fire' | 'circle-filled' | 'circle-outlined'
}

const FOCUS_PALETTE_LIGHT = {
  critical: { color: '#8B3A2E', background: '#F5E8E3' },
  high: { color: '#8B5A00', background: '#FFF5E0' },
  medium: { color: '#5C6A1E', background: '#F0F2D8' },
  low: { color: '#6D6A63', background: '#EFEAE0' },
} as const

const FOCUS_PALETTE_DARK = {
  critical: { color: '#D49285', background: 'rgba(200, 122, 107, 0.16)' },
  high: { color: '#D4A862', background: 'rgba(200, 154, 82, 0.16)' },
  medium: { color: '#B5C272', background: 'rgba(143, 160, 88, 0.16)' },
  low: { color: '#A8A196', background: 'rgba(143, 138, 126, 0.18)' },
} as const

function getFocusLevel(strength: number, isDark: boolean): FocusLevel {
  const palette = isDark ? FOCUS_PALETTE_DARK : FOCUS_PALETTE_LIGHT
  if (strength >= 80) return { labelKey: 'focus.critical', ...palette.critical, icon: 'fire' }
  if (strength >= 55) return { labelKey: 'focus.high', ...palette.high, icon: 'fire' }
  if (strength >= 30) return { labelKey: 'focus.medium', ...palette.medium, icon: 'circle-filled' }
  return { labelKey: 'focus.low', ...palette.low, icon: 'circle-outlined' }
}

export function FocusLevelBadge({ strength }: FocusLevelBadgeProps) {
  const { t } = useI18n()
  const { mode } = useThemeMode()
  if (strength == null) return null

  const level = getFocusLevel(strength, mode === 'dark')

  let iconNode: React.ReactNode = null
  if (level.icon === 'fire') {
    iconNode = <FireFilled style={{ color: level.color, fontSize: 12 }} />
  } else if (level.icon === 'circle-filled') {
    iconNode = (
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
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
          width: 6,
          height: 6,
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
        padding: '3px 10px',
        fontSize: 12,
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
