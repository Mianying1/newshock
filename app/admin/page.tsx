'use client'

import Link from 'next/link'
import { Card, Flex, Tag, Typography, theme } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { AdminShell } from '@/components/admin/AdminShell'

const { Title, Text } = Typography

interface AdminLink {
  href: string
  label: string
  desc: string
  tag?: string
}

const LINKS: AdminLink[] = [
  { href: '/admin/health', label: 'Health Dashboard', desc: 'Pipeline, crons, coverage, alerts', tag: 'monitor' },
  { href: '/admin/candidates', label: 'Archetype Candidates', desc: 'Weekly scan review queue', tag: 'review' },
  // 隐藏 · ticker 重构后 / 0 用户阶段不需要
  // { href: '/admin/angles', label: 'New Angle Candidates', desc: 'Long-horizon angle proposals from events' },
  { href: '/admin/coverage-audit', label: 'Coverage Audit', desc: 'Archetype coverage + suggestions', tag: 'review' },
  // 隐藏 · ticker 重构后 / 0 用户阶段不需要
  // { href: '/admin/cases', label: 'Historical Cases', desc: 'Case library' },
  // 隐藏 · ticker 重构后 / 0 用户阶段不需要
  // { href: '/admin/ticker-graph', label: 'Ticker Graph', desc: 'Ticker ↔ archetype relationships' },
]

export default function AdminHubPage() {
  return (
    <AdminShell
      title="Admin"
      subtitle="Internal tools · no end-user UI"
      showBack={false}
      maxWidth={760}
    >
      <Flex vertical gap={10}>
        {LINKS.map((l) => (
          <AdminLinkCard key={l.href} link={l} />
        ))}
      </Flex>
    </AdminShell>
  )
}

function AdminLinkCard({ link }: { link: AdminLink }) {
  const { token } = theme.useToken()
  return (
    <Link href={link.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card
        size="small"
        styles={{ body: { padding: '16px 20px' } }}
        style={{ borderColor: token.colorBorderSecondary }}
        hoverable
      >
        <Flex justify="space-between" align="center" gap={12}>
          <div>
            <Flex align="center" gap={8}>
              <Title
                level={5}
                style={{ margin: 0, fontSize: 15, fontWeight: 600, color: token.colorText }}
              >
                {link.label}
              </Title>
              {link.tag && (
                <Tag
                  bordered={false}
                  style={{
                    fontSize: 10,
                    padding: '0 6px',
                    lineHeight: '18px',
                    background: token.colorFillTertiary,
                    color: token.colorTextTertiary,
                    margin: 0,
                  }}
                >
                  {link.tag}
                </Tag>
              )}
            </Flex>
            <Text
              style={{ fontSize: 12, color: token.colorTextTertiary, display: 'block', marginTop: 2 }}
            >
              {link.desc}
            </Text>
            <Text
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: 11,
                color: token.colorTextQuaternary,
                display: 'block',
                marginTop: 2,
              }}
            >
              {link.href}
            </Text>
          </div>
          <ArrowRightOutlined style={{ color: token.colorTextQuaternary }} />
        </Flex>
      </Card>
    </Link>
  )
}
