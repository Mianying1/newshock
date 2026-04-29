'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n-context'

const LOCALE_PREFIXED_BASES = ['/themes/', '/tickers/'] as const

function toggleLocaleInPath(pathname: string, target: 'en' | 'zh'): string {
  const isZh = pathname.startsWith('/zh/') || pathname === '/zh'
  if (target === 'zh') {
    if (isZh) return pathname
    if (LOCALE_PREFIXED_BASES.some((base) => pathname.startsWith(base))) {
      return `/zh${pathname}`
    }
    return pathname
  }
  if (isZh) {
    const stripped = pathname.replace(/^\/zh/, '') || '/'
    return stripped
  }
  return pathname
}

export function LocaleToggle() {
  const { locale, setLocale } = useI18n()
  const router = useRouter()
  const pathname = usePathname() || '/'

  const onClick = () => {
    const next = locale === 'en' ? 'zh' : 'en'
    setLocale(next)
    const target = toggleLocaleInPath(pathname, next)
    if (target !== pathname) router.push(target)
  }

  return (
    <button
      onClick={onClick}
      className="text-xs text-zinc-500 hover:text-zinc-900 transition border border-zinc-200 rounded px-2 py-0.5"
    >
      {locale === 'en' ? '中' : 'EN'}
    </button>
  )
}
