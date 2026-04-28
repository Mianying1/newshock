'use client'

import { Tag } from 'antd'
import { useThemeMode } from '@/lib/providers'

export type Direction = 'benefits' | 'headwind' | 'mixed' | 'uncertain' | string | null

interface Props {
  direction: Direction
  label: string
  fontSize?: number
}

const PALETTE_LIGHT = {
  benefits: { color: '#155C3B', background: '#D6E9DA' },
  headwind: { color: '#9C463B', background: '#F0D9D2' },
  mixed: { color: '#5E646D', background: '#EBEEF2' },
  uncertain: { color: '#8C939C', background: '#F2F4F7' },
} as const

const PALETTE_DARK = {
  benefits: { color: '#B5C272', background: 'rgba(143, 160, 88, 0.16)' },
  headwind: { color: '#D49285', background: 'rgba(200, 122, 107, 0.16)' },
  mixed: { color: '#A8A196', background: 'rgba(143, 138, 126, 0.18)' },
  uncertain: { color: '#7A7468', background: 'rgba(120, 115, 105, 0.16)' },
} as const

export function DirectionTag({ direction, label, fontSize = 11 }: Props) {
  const { mode } = useThemeMode()
  const palette = mode === 'dark' ? PALETTE_DARK : PALETTE_LIGHT
  const key =
    direction === 'benefits' ? 'benefits'
    : direction === 'headwind' ? 'headwind'
    : direction === 'mixed' ? 'mixed'
    : 'uncertain'
  const tier = palette[key]
  const dot = Math.max(5, Math.round(fontSize * 0.5))
  return (
    <Tag
      style={{
        background: tier.background,
        color: tier.color,
        border: 'none',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize,
        fontWeight: 500,
        margin: 0,
        lineHeight: 1.4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span
        aria-hidden
        style={{
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: tier.color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {label}
    </Tag>
  )
}
