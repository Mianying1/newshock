'use client'

import React from 'react'
import { Tag } from 'antd'
import { FireFilled } from '@ant-design/icons'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'
import type { PlaybookStage } from '@/types/recommendations'

interface FocusLevelBadgeProps {
  strength: number | null | undefined
  stage?: PlaybookStage | null
  typicalDurationDaysUpper?: number | null
}

interface FocusLevel {
  labelKey: string
  color: string
  background: string
  icon: 'fire' | 'circle-filled' | 'circle-outlined'
}

type StageKey = 'early' | 'mid' | 'late' | 'beyond' | 'unknown'
type DurationTier = 'short' | 'medium' | 'long'

// Stage penalty tiered by typical duration. Short-term themes that have moved
// past early stage decay much faster — a 90-day archetype at mid stage is
// effectively half-done, while a 5-year archetype at mid stage is barely warm.
const STAGE_MULT: Record<DurationTier, Record<StageKey, number>> = {
  short:  { early: 1.0, mid: 0.65, late: 0.40, beyond: 0.25, unknown: 1.0 },
  medium: { early: 1.0, mid: 0.78, late: 0.55, beyond: 0.40, unknown: 1.0 },
  long:   { early: 1.0, mid: 0.85, late: 0.65, beyond: 0.50, unknown: 1.0 },
}

function durationTier(maxDays: number | null | undefined): DurationTier {
  if (maxDays && maxDays > 0 && maxDays <= 90) return 'short'
  if (maxDays && maxDays <= 365) return 'medium'
  return 'long'
}

const FOCUS_PALETTE_LIGHT = {
  critical: { color: '#FFFFFF', background: '#9C463B' },
  high: { color: '#2A4488', background: '#DCE4F2' },
  medium: { color: '#155C3B', background: '#D6E9DA' },
  low: { color: '#5E646D', background: '#EBEEF2' },
} as const

const FOCUS_PALETTE_DARK = {
  critical: { color: '#FFE4DD', background: '#7A2A1E' },
  high: { color: '#E2B36B', background: 'rgba(200, 154, 82, 0.22)' },
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

export function FocusLevelBadge({ strength, stage, typicalDurationDaysUpper }: FocusLevelBadgeProps) {
  const { t } = useI18n()
  const { mode } = useThemeMode()
  if (strength == null) return null

  const tier = durationTier(typicalDurationDaysUpper)
  const stageKey: StageKey = (stage as StageKey) ?? 'unknown'
  const mult = STAGE_MULT[tier][stageKey] ?? 1
  const adjusted = Math.round(strength * mult)
  const level = getFocusLevel(adjusted, mode === 'dark')

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
