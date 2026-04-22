'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'
import { formatMinutesAgo } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Overview {
  active_count: number
  cooling_count: number
  rec_count: number
  events_7d: number
  updated_minutes: number | null
}

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v9l6 6" />
    </svg>
  )
}

function RadarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.07 4.93a10 10 0 1 1-14.14 14.14" />
      <path d="M12 12 8 8" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}
function TrendingUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function Sidebar() {
  const { t } = useI18n()
  const pathname = usePathname() ?? '/'
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
    { href: '/', labelKey: 'sidebar.themes', count: themeCount, Icon: LayersIcon },
    { href: '/tickers', labelKey: 'sidebar.tickers', count: tickerCount, Icon: TrendingUpIcon },
    { href: '/', labelKey: 'sidebar.events', count: events7d, Icon: ClockIcon },
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <BrandMark />
        </span>
        <div>
          <div className="brand-name">Newshock</div>
          <div className="brand-sub">Radar</div>
        </div>
        <span className="brand-v">v1.0</span>
      </div>

      <div className="nav-section">{t('sidebar.workspace')}</div>

      {items.map(({ href, labelKey, count, Icon }, i) => {
        const active =
          i === 0
            ? pathname === '/'
            : href !== '/' && pathname.startsWith(href)
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
  )
}
