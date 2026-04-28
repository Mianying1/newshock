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
  const isEn = locale === 'en'
  return (
    <Text
      style={{
        fontFamily: token.fontFamily,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: isEn ? '0.01em' : '0.04em',
        textTransform: 'none',
        color: token.colorTextQuaternary,
        marginRight: 4,
        minWidth,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
    >
      {children}
    </Text>
  )
}
