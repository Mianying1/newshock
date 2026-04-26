'use client'

import { Flex, Typography, theme } from 'antd'
import type { ReactNode } from 'react'

const { Title, Text } = Typography
const { useToken } = theme

export interface PageStat {
  value: number | string
  label: ReactNode
  emphasize?: boolean
}

interface PageHeaderProps {
  title: ReactNode
  icon?: ReactNode
  stats?: PageStat[]
  live?: boolean
  liveLabel?: ReactNode
  meta?: ReactNode
}

export function PageHeader({
  title,
  icon,
  stats = [],
  live = false,
  liveLabel = 'Live',
  meta,
}: PageHeaderProps) {
  const { token } = useToken()

  return (
    <div
      style={{
        padding: '34px 2px 22px',
        borderBottom: `1px solid ${token.colorSplit}`,
      }}
    >
      <Flex
        align="flex-end"
        justify="space-between"
        wrap
        gap={16}
      >
        <Flex align="center" gap={14}>
          {icon && (
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                color: token.colorTextSecondary,
              }}
            >
              {icon}
            </span>
          )}
          <Title
            level={1}
            style={{
              margin: 0,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {title}
          </Title>
        </Flex>
        {meta && (
          <Text
            style={{
              fontSize: 11.5,
              color: token.colorTextQuaternary,
              fontFamily: token.fontFamilyCode,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {meta}
          </Text>
        )}
      </Flex>

      {(live || stats.length > 0) && (
        <Flex
          align="center"
          gap={0}
          wrap
          style={{ marginTop: 14, rowGap: 8 }}
        >
          {live && (
            <span
              className="page-header-pulse"
              style={{ background: token.colorSuccess, marginRight: 12 }}
              aria-hidden
              title={typeof liveLabel === 'string' ? liveLabel : undefined}
            />
          )}

          {stats.map((s, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: token.colorText,
                  fontFamily: token.fontFamilyCode,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                  lineHeight: 1,
                }}
              >
                {s.value}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: token.colorTextTertiary,
                  marginLeft: 6,
                  letterSpacing: '0.01em',
                }}
              >
                {s.label}
              </Text>
              {i < stats.length - 1 && (
                <PageHeaderDivider color={token.colorBorderSecondary} />
              )}
            </span>
          ))}
        </Flex>
      )}
    </div>
  )
}

function PageHeaderDivider({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 1,
        height: 12,
        background: color,
        margin: '0 14px',
        verticalAlign: 'middle',
      }}
    />
  )
}
