'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { Badge, theme } from 'antd'
import { useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '@/lib/i18n-context'
import { formatMinutesAgo } from '@/lib/utils'
import { RadarIcon, LayersIcon, TrendingUpIcon, ClockIcon } from '@/components/shared/NavIcons'

const TABBAR_INDEX_KEY = 'newshock:mobile-tab-index'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Overview {
  active_count: number
  cooling_count: number
  rec_count: number
  events_7d: number
  updated_minutes: number | null
}

export function Sidebar() {
  const { t } = useI18n()
  const pathname = usePathname() ?? '/'
  const { token } = theme.useToken()
  const { data } = useSWR<Overview>('/api/meta/overview', fetcher, {
    refreshInterval: 60_000,
  })

  const themeCount = (data?.active_count ?? 0) + (data?.cooling_count ?? 0)
  const tickerCount = data?.rec_count ?? 0
  const events7d = data?.events_7d ?? 0
  const lastSync =
    data?.updated_minutes !== null && data?.updated_minutes !== undefined
      ? formatMinutesAgo(data.updated_minutes, t)
      : '—'

  const items: { href: string; labelKey: string; count?: number; Icon: () => JSX.Element }[] = [
    { href: '/', labelKey: 'sidebar.radar', Icon: RadarIcon },
    { href: '/themes', labelKey: 'sidebar.themes', count: themeCount, Icon: LayersIcon },
    { href: '/tickers', labelKey: 'sidebar.tickers', count: tickerCount, Icon: TrendingUpIcon },
    { href: '/events', labelKey: 'sidebar.events', count: events7d, Icon: ClockIcon },
  ]

  const isActive = (href: string, i: number) =>
    i === 0 ? pathname === '/' : href !== '/' && pathname.startsWith(href)

  const targetIndex = Math.max(0, items.findIndex((it, i) => isActive(it.href, i)))
  const [renderedIndex, setRenderedIndex] = useState(targetIndex)

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(TABBAR_INDEX_KEY) : null
    const prev = stored !== null ? Number(stored) : targetIndex
    setRenderedIndex(prev)
    const raf = requestAnimationFrame(() => {
      setRenderedIndex(targetIndex)
      try {
        window.sessionStorage.setItem(TABBAR_INDEX_KEY, String(targetIndex))
      } catch {}
    })
    return () => cancelAnimationFrame(raf)
  }, [targetIndex])

  return (
    <>
      <aside className="sidebar">
        <Link href="/" className="brand-logo" aria-label="Newshock">
          <Image
            src="/newshock-logo.png"
            alt="Newshock"
            width={2403}
            height={456}
            priority
            sizes="160px"
          />
        </Link>

        {items.map(({ href, labelKey, count, Icon }, i) => {
          const active = isActive(href, i)
          return (
            <Link
              key={`${labelKey}-${i}`}
              href={href}
              className={`nav-item${active ? ' active' : ''}`}
            >
              <Icon />
              <span>{t(labelKey)}</span>
              {typeof count === 'number' && count > 0 && (
                <span className="count">{count}</span>
              )}
            </Link>
          )
        })}

        <div className="sidebar-foot">
          <div className="line">
            <span>
              <span className="pulse" aria-hidden />
              <span className="k">{t('sidebar.last_sync')}</span>
              {lastSync}
            </span>
          </div>
          <div className="line">
            <span>
              <span className="k">{t('sidebar.license_expires')}</span>
              15d
            </span>
          </div>
        </div>
      </aside>

      <nav className="mobile-tabbar" aria-label="Primary">
        <div
          className="mobile-tabbar-pill"
          style={{ '--active-index': renderedIndex } as CSSProperties}
        >
          <span className="mobile-tabbar-indicator" aria-hidden />
          {items.map(({ href, labelKey, count, Icon }, i) => {
            const active = isActive(href, i)
            return (
              <Link
                key={`m-${labelKey}-${i}`}
                href={href}
                className={`mobile-tab${active ? ' active' : ''}`}
              >
                <span className="mobile-tab-icon">
                  <Icon />
                </span>
                <span className="mobile-tab-label">{t(labelKey)}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
