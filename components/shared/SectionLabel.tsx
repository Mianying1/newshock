'use client'

import { Flex, Typography, theme } from 'antd'
import type { ReactNode } from 'react'

const { Text } = Typography
const { useToken } = theme

interface SectionLabelProps {
  label: ReactNode
  extra?: ReactNode
}

export function SectionLabel({ label, extra }: SectionLabelProps) {
  const { token } = useToken()
  return (
    <Flex
      justify="space-between"
      align="baseline"
      gap={20}
      style={{ margin: '22px 2px 10px' }}
    >
      <Text
        style={{
          fontFamily: token.fontFamilyCode,
          fontSize: 10.5,
          letterSpacing: '0.16em',
          color: token.colorTextTertiary,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Text>
      {extra !== undefined && (
        <Text
          style={{
            fontSize: 11,
            color: token.colorTextTertiary,
          }}
        >
          {extra}
        </Text>
      )}
    </Flex>
  )
}
