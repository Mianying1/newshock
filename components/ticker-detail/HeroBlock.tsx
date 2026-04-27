'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { Flex, Tag, Tooltip, Typography, theme } from 'antd'

const { Title, Text } = Typography
const { useToken } = theme

export interface HeroThemeTag {
  themeId: string
  label: string
  direction: 'benefits' | 'headwind' | 'mixed' | 'uncertain' | string | null
}

interface Props {
  symbol: string
  companyName: string | null
  sector: string | null
  shortScore: number | null
  longScore: number | null
  potentialScore: number | null
  heroLine: string | null
  themes?: HeroThemeTag[]
  heroLabels: { short: string; long: string; potential: string }
  scoreTooltips?: { short: string; long: string; potential: string }
}

const DIRECTION_DOT = {
  benefits: '#5C6A1E',
  headwind: '#8B3A2E',
  mixed: '#8C8A85',
  uncertain: '#8C8A85',
} as const

function dotColor(d: HeroThemeTag['direction']): string {
  if (d === 'benefits') return DIRECTION_DOT.benefits
  if (d === 'headwind') return DIRECTION_DOT.headwind
  if (d === 'mixed') return DIRECTION_DOT.mixed
  return DIRECTION_DOT.uncertain
}

function MetaTag({
  children,
  href,
  leadingDot,
}: {
  children: React.ReactNode
  href?: string
  leadingDot?: string
}) {
  const { token } = useToken()
  const inner = (
    <Tag
      style={{
        margin: 0,
        background: token.colorFillAlter,
        color: token.colorTextSecondary,
        border: `1px solid ${token.colorBorder}`,
        fontSize: 12,
        fontWeight: 500,
        padding: '2px 10px',
        borderRadius: 4,
        lineHeight: 1.5,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: href ? 'pointer' : 'default',
      }}
    >
      {leadingDot && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: leadingDot,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </Tag>
  )
  return href ? (
    <Link href={href} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  ) : (
    inner
  )
}

function ScoreStat({
  value,
  label,
  tooltip,
}: {
  value: number
  label: string
  tooltip?: string
}) {
  const { token } = useToken()
  const inner = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        cursor: tooltip ? 'help' : 'default',
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: token.colorText,
          fontFamily: token.fontFamilyCode,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {Math.round(value)}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: token.colorTextQuaternary,
          fontFamily: token.fontFamilyCode,
          marginLeft: 3,
          lineHeight: 1,
        }}
      >
        / 100
      </Text>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 500,
          color: token.colorTextTertiary,
          marginLeft: 8,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </span>
  )
  return tooltip ? <Tooltip title={tooltip}>{inner}</Tooltip> : inner
}

export function HeroBlock({
  symbol,
  companyName,
  sector,
  shortScore,
  longScore,
  potentialScore,
  heroLine,
  themes = [],
  heroLabels,
  scoreTooltips,
}: Props) {
  const { token } = useToken()
  const topThemes = themes.slice(0, 3)
  const stats: Array<{ key: 'short' | 'long' | 'potential'; value: number; label: string; tooltip?: string }> = []
  if (shortScore != null) stats.push({ key: 'short', value: shortScore, label: heroLabels.short, tooltip: scoreTooltips?.short })
  if (longScore != null) stats.push({ key: 'long', value: longScore, label: heroLabels.long, tooltip: scoreTooltips?.long })
  if (potentialScore != null) stats.push({ key: 'potential', value: potentialScore, label: heroLabels.potential, tooltip: scoreTooltips?.potential })

  return (
    <div
      style={{
        padding: '20px 2px 24px',
        borderBottom: `1px solid ${token.colorSplit}`,
      }}
    >
      <Flex align="baseline" gap={12} wrap style={{ marginBottom: 14 }}>
        <Title
          level={1}
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            color: token.colorText,
          }}
        >
          {symbol}
        </Title>
        {companyName && (
          <Text style={{ fontSize: 13, color: token.colorTextTertiary }}>
            {companyName}
          </Text>
        )}
      </Flex>

      <Flex
        align="center"
        justify="space-between"
        gap={16}
        wrap
        style={{ marginBottom: 14, rowGap: 10 }}
      >
        <Flex align="center" gap={8} wrap>
          {sector && <MetaTag>{sector}</MetaTag>}
          {topThemes.map((th) => (
            <MetaTag
              key={th.themeId}
              href={`/themes/${th.themeId}`}
              leadingDot={dotColor(th.direction)}
            >
              {th.label}
            </MetaTag>
          ))}
        </Flex>

        {stats.length > 0 && (
          <Flex align="center" gap={0} style={{ flexShrink: 0 }}>
            {stats.map((s, i) => (
              <Fragment key={s.key}>
                {i > 0 && (
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 1,
                      height: 22,
                      background: token.colorBorder,
                      margin: '0 18px',
                      verticalAlign: 'middle',
                    }}
                  />
                )}
                <ScoreStat value={s.value} label={s.label} tooltip={s.tooltip} />
              </Fragment>
            ))}
          </Flex>
        )}
      </Flex>

      <Text
        style={{
          display: 'block',
          fontSize: 13,
          lineHeight: 1.6,
          color: token.colorTextTertiary,
          maxWidth: 640,
        }}
      >
        {heroLine ?? '—'}
      </Text>
    </div>
  )
}
