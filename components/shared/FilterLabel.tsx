'use client'

import { Typography, theme } from 'antd'
import type { ReactNode } from 'react'

const { Text } = Typography
const { useToken } = theme

interface FilterLabelProps {
  locale: 'en' | 'zh'
  minWidth?: number
  children: ReactNode
}

export function FilterLabel({ locale, minWidth, children }: FilterLabelProps) {
  const { token } = useToken()
  const resolvedMinWidth = minWidth ?? (locale === 'zh' ? 52 : 80)
  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: locale === 'zh' ? '0.08em' : '0.18em',
        textTransform: 'none',
        color: token.colorTextQuaternary,
        marginRight: 12,
        minWidth: resolvedMinWidth,
        display: 'inline-block',
      }}
    >
      {children}
    </Text>
  )
}
