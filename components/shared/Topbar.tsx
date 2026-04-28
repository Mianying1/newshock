'use client'

import { Button, Input, Layout, Space, Typography, theme } from 'antd'
import { MoonOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons'
import { useI18n } from '@/lib/i18n-context'
import { useThemeMode } from '@/lib/providers'

const { Text } = Typography
const { Header } = Layout
const { useToken } = theme

interface TopbarProps {
  sidePad: number
}

export function Topbar({ sidePad }: TopbarProps) {
  const { t, locale, setLocale } = useI18n()
  const { token } = useToken()
  const { mode, toggle } = useThemeMode()

  return (
    <Header
      style={{
        position: 'sticky',
        top: 14,
        zIndex: 30,
        height: 60,
        margin: '14px 14px 0 14px',
        padding: '12px 14px',
        background: 'var(--sidebar-glass-bg, var(--topbar-bg))',
        border: '1px solid var(--sidebar-glass-border, transparent)',
        borderRadius: 14,
        boxShadow:
          '0 -28px 0 0 var(--bg), 0 8px 24px rgba(15, 18, 22, 0.06)',
        backdropFilter: 'saturate(160%) blur(20px)',
        WebkitBackdropFilter: 'saturate(160%) blur(20px)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        lineHeight: 1,
      }}
    >
      <Input
        disabled
        prefix={
          <SearchOutlined
            style={{ fontSize: 13, color: token.colorTextTertiary }}
          />
        }
        placeholder={t('topbar.search_placeholder')}
        suffix={
          <Text
            style={{
              fontSize: 11,
              color: token.colorTextQuaternary,
            }}
          >
            {t('topbar.search_soon')}
          </Text>
        }
        style={{
          flex: 1,
          height: 36,
          fontSize: 12.5,
          borderRadius: 999,
          background: 'var(--topbar-search-bg)',
          border: '1px solid var(--sidebar-glass-border)',
          boxShadow: 'none',
          paddingInline: 16,
          color: token.colorTextSecondary,
        }}
      />
      <Space className="topbar-actions" size={4}>
        <Button
          className="topbar-iconbtn"
          type="text"
          aria-label={t('topbar.toggle_locale')}
          onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            color: token.colorTextSecondary,
          }}
        >
          <span key={locale} className="topbar-iconbtn-inner">
            {locale === 'en' ? 'EN' : '中'}
          </span>
        </Button>
        <Button
          className="topbar-iconbtn"
          type="text"
          aria-label={t(
            mode === 'dark' ? 'topbar.switch_light' : 'topbar.switch_dark',
          )}
          icon={
            <span key={mode} className="topbar-iconbtn-inner">
              {mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            </span>
          }
          onClick={toggle}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: 999,
            color: token.colorTextSecondary,
          }}
        />
      </Space>
    </Header>
  )
}
