'use client'
import { useI18n } from '@/lib/i18n-context'

export function LocaleToggle() {
  const { locale, setLocale } = useI18n()

  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
      className="text-xs text-zinc-500 hover:text-zinc-900 transition border border-zinc-200 rounded px-2 py-0.5"
    >
      {locale === 'en' ? '中' : 'EN'}
    </button>
  )
}
