'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Flex, Typography, theme } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import { DirectionTag } from './DirectionTag'

const { Text } = Typography
const { useToken } = theme

export interface AllThemesItem {
  themeId: string
  name: string
  tier: number
  exposureDirection: 'benefits' | 'headwind' | 'mixed' | 'uncertain' | string | null
  daysActive: number
}

interface Labels {
  toggle: string
  summary: string
  daysShort: string
  tier1: string
  tier2: string
  tier3: string
  directionBenefits: string
  directionHeadwind: string
  directionMixed: string
  directionUncertain: string
}

interface Props {
  items: AllThemesItem[]
  labels: Labels
  defaultOpen?: boolean
}

function tierLabel(tier: number, labels: Labels): string {
  if (tier === 1) return labels.tier1
  if (tier === 2) return labels.tier2
  return labels.tier3
}

function directionLabel(d: AllThemesItem['exposureDirection'], labels: Labels): string {
  if (d === 'benefits') return labels.directionBenefits
  if (d === 'headwind') return labels.directionHeadwind
  if (d === 'mixed') return labels.directionMixed
  return labels.directionUncertain
}

function ThemeRow({ item, labels }: { item: AllThemesItem; labels: Labels }) {
  const { token } = useToken()
  return (
    <Link
      href={`/themes/${item.themeId}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '6px 4px',
        borderRadius: 4,
        textDecoration: 'none',
        color: token.colorText,
      }}
      className="all-themes-row"
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 12.5,
          fontWeight: 500,
          color: token.colorText,
        }}
      >
        <span style={{ color: token.colorTextQuaternary, marginRight: 8 }}>·</span>
        {item.name}
      </span>
      <Flex align="center" gap={10} style={{ flexShrink: 0 }}>
        <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
          {tierLabel(item.tier, labels)}
        </Text>
        <DirectionTag
          direction={item.exposureDirection}
          label={directionLabel(item.exposureDirection, labels)}
        />
        <Text
          style={{
            fontFamily: token.fontFamilyCode,
            fontSize: 11,
            color: token.colorTextTertiary,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 36,
            textAlign: 'right',
          }}
        >
          {labels.daysShort.replace('{n}', String(item.daysActive))}
        </Text>
      </Flex>
    </Link>
  )
}

export function AllThemesCollapsed({ items, labels, defaultOpen = false }: Props) {
  const { token } = useToken()
  const [open, setOpen] = useState(defaultOpen)

  const counts = items.reduce(
    (acc, it) => {
      if (it.tier === 1) acc.core++
      else if (it.tier === 2) acc.important++
      else acc.secondary++
      return acc
    },
    { core: 0, important: 0, secondary: 0 },
  )

  if (items.length === 0) return null

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '12px 14px',
          background: token.colorFillAlter,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <DownOutlined
          style={{
            fontSize: 10,
            color: token.colorTextTertiary,
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 240ms cubic-bezier(0.22, 0.9, 0.32, 1)',
          }}
        />
        <Text style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>
          {labels.toggle.replace('{n}', String(items.length))}
        </Text>
        <span style={{ flex: 1 }} />
        <Text
          style={{
            fontFamily: token.fontFamilyCode,
            fontSize: 11,
            color: token.colorTextTertiary,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {labels.summary
            .replace('{core}', String(counts.core))
            .replace('{important}', String(counts.important))
            .replace('{secondary}', String(counts.secondary))}
        </Text>
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 280ms cubic-bezier(0.22, 0.9, 0.32, 1)',
        }}
      >
        <div
          style={{
            overflow: 'hidden',
            minHeight: 0,
            opacity: open ? 1 : 0,
            transition: 'opacity 200ms ease',
            transitionDelay: open ? '120ms' : '0ms',
          }}
        >
          <Flex
            vertical
            gap={2}
            style={{
              padding: '10px 4px 4px',
              marginTop: 4,
            }}
          >
            {items.map((it) => (
              <ThemeRow key={it.themeId} item={it} labels={labels} />
            ))}
          </Flex>
        </div>
      </div>

      <style jsx>{`
        :global(.all-themes-row:hover) {
          background: ${token.colorFillTertiary};
        }
      `}</style>
    </div>
  )
}
