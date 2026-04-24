'use client'

import { Avatar, Flex, Typography, theme } from 'antd'
import type { ReactNode } from 'react'

const { Text } = Typography
const { useToken } = theme

interface CuratorStripProps {
  initials: string
  name: string
  role: ReactNode
  byLabel: ReactNode
  disclaim: ReactNode
}

export function CuratorStrip({
  initials,
  name,
  role,
  byLabel,
  disclaim,
}: CuratorStripProps) {
  const { token } = useToken()
  return (
    <Flex
      align="center"
      gap={14}
      wrap
      style={{
        marginTop: 36,
        padding: '18px 20px',
        borderTop: `1px dashed ${token.colorBorder}`,
        color: token.colorTextTertiary,
        fontSize: 12,
      }}
    >
      <Avatar
        size={32}
        style={{
          background: '#D4C8B2',
          color: '#5C5242',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {initials}
      </Avatar>
      <div>
        <Text style={{ color: token.colorTextTertiary }}>{byLabel}</Text>{' '}
        <Text strong style={{ color: token.colorText }}>
          {name}
        </Text>{' '}
        · {role}
      </div>
      <Text
        style={{
          marginLeft: 'auto',
          fontFamily: token.fontFamilyCode,
          fontSize: 10.5,
          color: token.colorTextQuaternary,
        }}
      >
        {disclaim}
      </Text>
    </Flex>
  )
}
