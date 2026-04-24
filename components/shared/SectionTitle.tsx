'use client'

import { theme, Typography } from 'antd'

const { Text } = Typography
const { useToken } = theme

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const { token } = useToken()
  return (
    <Text
      style={{
        fontFamily: token.fontFamily,
        fontSize: token.fontSizeSM,
        fontWeight: 500,
        color: token.colorTextSecondary,
      }}
    >
      {children}
    </Text>
  )
}
