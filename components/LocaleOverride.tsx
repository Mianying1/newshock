'use client'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/lib/i18n-context'

export function LocaleOverride({
  locale,
  children,
}: {
  locale: 'en' | 'zh'
  children: ReactNode
}) {
  return <I18nProvider initialLocale={locale}>{children}</I18nProvider>
}
