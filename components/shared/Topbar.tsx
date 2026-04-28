'use client'

import { Button, Input, Layout, Space, Typography, theme } from 'antd'
import { MoonOutlined, SearchOutlined, SunOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
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
  const [hidden, setHidden] = useState(false)
  const hiddenRef = useRef(false)
  const lastScrollRef = useRef(0)
  const tickingRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    document.body.dataset.scrollHidden = 'false'
    document.body.dataset.topbarHidden = 'false'
    delete document.body.dataset.scrolled
    hiddenRef.current = false
    lastScrollRef.current = window.scrollY

    // Topbar hides as soon as the user starts scrolling past its slot.
    const TOPBAR_THRESHOLD = 60
    // Filter only hides once it's sticky-pinned at top:88 (i.e., user has scrolled past
    // its natural DOM position), so the hide-transform doesn't cross through the title.
    const FILTER_THRESHOLD = 220

    const onScroll = () => {
      if (tickingRef.current) return
      tickingRef.current = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - lastScrollRef.current
        const isMobile = window.innerWidth <= 900

        let nextTopbar = hiddenRef.current
        if (!isMobile || y < TOPBAR_THRESHOLD) {
          nextTopbar = false
        } else if (delta > 6) {
          nextTopbar = true
        } else if (delta < -2) {
          nextTopbar = false
        }
        if (nextTopbar !== hiddenRef.current) {
          hiddenRef.current = nextTopbar
          setHidden(nextTopbar)
          document.body.dataset.topbarHidden = nextTopbar ? 'true' : 'false'
        }

        let nextFilter = document.body.dataset.scrollHidden === 'true'
        if (!isMobile || y < FILTER_THRESHOLD) {
          nextFilter = false
        } else if (delta > 6) {
          nextFilter = true
        } else if (delta < -2) {
          nextFilter = false
        }
        const currentFilter = document.body.dataset.scrollHidden === 'true'
        if (nextFilter !== currentFilter) {
          document.body.dataset.scrollHidden = nextFilter ? 'true' : 'false'
        }

        if (isMobile && y > 140) {
          if (document.body.dataset.scrolled !== 'true') document.body.dataset.scrolled = 'true'
        } else if (document.body.dataset.scrolled === 'true') {
          delete document.body.dataset.scrolled
        }
        lastScrollRef.current = y
        tickingRef.current = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      delete document.body.dataset.scrollHidden
      delete document.body.dataset.topbarHidden
      delete document.body.dataset.scrolled
    }
  }, [])

  return (
    <Header
      style={{
        position: 'sticky',
        top: 14,
        zIndex: 30,
        height: 60,
        margin: '14px 14px 0 14px',
        padding: '12px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--sidebar-glass-border, transparent)',
        borderRadius: 14,
        boxShadow:
          '0 0 0 14px var(--bg), 0 8px 24px rgba(15, 18, 22, 0.06)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        lineHeight: 1,
        transform: hidden
          ? 'translate3d(0, calc(-100% - 28px), 0)'
          : 'translate3d(0, 0, 0)',
        transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
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
