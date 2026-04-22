'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { useI18n } from '@/lib/i18n-context'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Overview {
  active_count: number
  cooling_count: number
  rec_count: number
  updated_minutes: number | null
}

function RadarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M19.07 4.93a10 10 0 1 1-14.14 14.14" />
      <path d="M12 12 8 8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M15 12a3 3 0 1 0-3 3" />
    </svg>
  )
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function TrendingUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function RadarLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 3v9l6.5 6.5" />
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
  const lastSync = data?.updated_minutes ?? null

  const items: { href: string; labelKey: string; count?: number | null; Icon: () => JSX.Element }[] = [
    { href: '/', labelKey: 'sidebar.radar', Icon: RadarIcon },
    { href: '/', labelKey: 'sidebar.themes', count: themeCount, Icon: ListIcon },
    { href: '/tickers', labelKey: 'sidebar.tickers', count: tickerCount, Icon: TrendingUpIcon },
    { href: '/', labelKey: 'sidebar.events', Icon: ClockIcon },
  ]

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[220px] bg-white border-r border-zinc-200 z-10">
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-2 text-zinc-900">
          <RadarLogo />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Newshock</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-400">RADAR · v1.0</div>
          </div>
        </div>
      </div>

      <nav className="px-3">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-widest text-zinc-400">
          {t('sidebar.workspace')}
        </div>
        <ul className="space-y-0.5">
          {items.map(({ href, labelKey, count, Icon }, i) => {
            const active = i === 0 ? pathname === '/' : pathname.startsWith(href) && href !== '/'
            return (
              <li key={labelKey}>
                <Link
                  href={href}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    active
                      ? 'bg-zinc-100 text-zinc-900 font-medium'
                      : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={active ? 'text-zinc-900' : 'text-zinc-400'}>
                      <Icon />
                    </span>
                    {t(labelKey)}
                  </span>
                  {typeof count === 'number' && count > 0 && (
                    <span className="font-mono text-[11px] text-zinc-400">{count}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-auto px-5 py-4 border-t border-zinc-100 text-[11px] text-zinc-500 space-y-1 font-mono">
        <div className="flex justify-between">
          <span className="text-zinc-400">{t('sidebar.last_sync')}</span>
          <span>{lastSync === null ? '—' : `${lastSync}m`}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">{t('sidebar.license_expires')}</span>
          <span>15d</span>
        </div>
      </div>
    </aside>
  )
}
