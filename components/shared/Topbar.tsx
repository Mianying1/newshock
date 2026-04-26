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
        top: 0,
        zIndex: 30,
        height: 52,
        padding: `10px ${sidePad}px`,
        background: 'var(--topbar-bg)',
        backdropFilter: 'saturate(160%) blur(16px)',
        WebkitBackdropFilter: 'saturate(160%) blur(16px)',
        borderBottom: `1px solid ${token.colorBorder}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Input
        disabled
        prefix={<SearchOutlined />}
        placeholder={t('topbar.search_placeholder')}
        suffix={
          <Text
            style={{
              fontFamily: token.fontFamilyCode,
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: token.colorTextQuaternary,
            }}
          >
            {t('topbar.search_soon')}
          </Text>
        }
        style={{ flex: 1 }}
      />
      <Space.Compact className="topbar-actions">
        <Button
          className="topbar-iconbtn"
          type="default"
          aria-label={t('topbar.toggle_locale')}
          onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
        >
          <span key={locale} className="topbar-iconbtn-inner">
            {locale === 'en' ? 'EN' : '中'}
          </span>
        </Button>
        <Button
          className="topbar-iconbtn"
          type="default"
          aria-label={t(
            mode === 'dark' ? 'topbar.switch_light' : 'topbar.switch_dark',
          )}
          icon={
            <span key={mode} className="topbar-iconbtn-inner">
              {mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            </span>
          }
          onClick={toggle}
        />
      </Space.Compact>
    </Header>
  )
}
