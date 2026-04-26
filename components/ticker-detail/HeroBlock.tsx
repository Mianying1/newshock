'use client'

import Link from 'next/link'
import { Flex, Tag, Typography, theme } from 'antd'

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
  thematicScore: number | null
  potentialScore: number | null
  heroLine: string | null
  themes?: HeroThemeTag[]
  heroLabels: { thematic: string; potential: string }
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
  emphasis = false,
}: {
  value: number
  label: string
  emphasis?: boolean
}) {
  const { token } = useToken()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
      <Text
        style={{
          fontSize: emphasis ? 22 : 18,
          fontWeight: 600,
          color: token.colorText,
          fontFamily: token.fontFamilyCode,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {value.toFixed(1)}
      </Text>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 500,
          color: token.colorTextTertiary,
          marginLeft: 6,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </span>
  )
}

export function HeroBlock({
  symbol,
  companyName,
  sector,
  thematicScore,
  potentialScore,
  heroLine,
  themes = [],
  heroLabels,
}: Props) {
  const { token } = useToken()
  const topThemes = themes.slice(0, 3)
  const hasScores = thematicScore != null || potentialScore != null

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

        {hasScores && (
          <Flex align="center" gap={0} style={{ flexShrink: 0 }}>
            {thematicScore != null && (
              <ScoreStat value={thematicScore} label={heroLabels.thematic} emphasis />
            )}
            {thematicScore != null && potentialScore != null && (
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
            {potentialScore != null && (
              <ScoreStat value={potentialScore} label={heroLabels.potential} />
            )}
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
