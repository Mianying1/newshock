'use client'

import Link from 'next/link'
import { Flex, Layout, Typography, theme } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'

const { Title, Text } = Typography

interface AdminShellProps {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  showBack?: boolean
  children: ReactNode
  maxWidth?: number
}

export function AdminShell({
  title,
  subtitle,
  meta,
  action,
  showBack = true,
  children,
  maxWidth = 960,
}: AdminShellProps) {
  const { token } = theme.useToken()

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <header
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ maxWidth, margin: '0 auto', padding: '14px 24px' }}>
          {showBack && (
            <Flex align="center" gap={8} style={{ marginBottom: 6 }}>
              <Link
                href="/admin"
                style={{
                  color: token.colorTextTertiary,
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                <ArrowLeftOutlined style={{ fontSize: 11 }} /> Admin
              </Link>
              <Text
                style={{
                  fontFamily: token.fontFamilyCode,
                  fontSize: 11,
                  color: token.colorTextQuaternary,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}
              >
                · Internal
              </Text>
            </Flex>
          )}
          <Flex justify="space-between" align="flex-end" gap={16} wrap>
            <div>
              <Title
                level={3}
                style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}
              >
                {title}
              </Title>
              {subtitle && (
                <Text
                  style={{ fontSize: 13, color: token.colorTextTertiary, display: 'block', marginTop: 2 }}
                >
                  {subtitle}
                </Text>
              )}
            </div>
            <Flex align="center" gap={12}>
              {meta && <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>{meta}</Text>}
              {action}
            </Flex>
          </Flex>
        </div>
      </header>
      <main
        style={{
          maxWidth,
          width: '100%',
          margin: '0 auto',
          padding: '24px',
        }}
      >
        {children}
      </main>
    </Layout>
  )
}
