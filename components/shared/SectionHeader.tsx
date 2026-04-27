'use client'

import { Flex, Typography, theme } from 'antd'
import type { ReactNode } from 'react'

const { Title, Text } = Typography
const { useToken } = theme

interface SectionHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  size?: 'lg' | 'sm'
  first?: boolean
}

export function SectionHeader({
  title,
  subtitle,
  meta,
  action,
  size = 'lg',
  first = false,
}: SectionHeaderProps) {
  const { token } = useToken()
  const isSm = size === 'sm'

  return (
    <div
      style={{
        marginTop: first ? 8 : isSm ? 24 : 32,
        marginBottom: isSm ? 10 : 14,
      }}
    >
      <Flex
        justify="space-between"
        align="baseline"
        gap={16}
        wrap
        style={{
          paddingBottom: first && isSm ? 14 : isSm ? 8 : 10,
          borderBottom: `1px solid ${token.colorSplit}`,
        }}
      >
        <Flex align="baseline" gap={12} wrap>
          <Title
            level={isSm ? 5 : 4}
            style={{
              margin: 0,
              fontSize: isSm ? 15 : 18,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              color: token.colorText,
            }}
          >
            {title}
          </Title>
          {subtitle && (
            <Text
              style={{
                fontSize: isSm ? 11 : 12,
                color: token.colorTextTertiary,
                letterSpacing: '0.02em',
              }}
            >
              {subtitle}
            </Text>
          )}
        </Flex>
        {(meta || action) && (
          <Flex align="baseline" gap={12}>
            {meta && (
              <Text style={{ fontSize: isSm ? 11 : 12, color: token.colorTextTertiary }}>
                {meta}
              </Text>
            )}
            {action}
          </Flex>
        )}
      </Flex>
    </div>
  )
}
