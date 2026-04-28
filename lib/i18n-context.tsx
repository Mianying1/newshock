'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import en from '@/locales/en.json'
import zh from '@/locales/zh.json'

type Locale = 'en' | 'zh'
const translations = { en, zh }

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always init with 'en' so SSR and first client render match. Sync from
  // localStorage after mount; if the stored locale differs, React re-renders
  // with the user's preference. Avoids hydration mismatch.
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    const stored = localStorage.getItem('locale') as Locale | null
    if (stored === 'zh' || stored === 'en') setLocale(stored)
  }, [])

  const setLocaleAndStore = (l: Locale) => {
    setLocale(l)
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', l)
    }
  }

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.')
    let value: unknown = translations[locale]
    for (const k of keys) value = (value as Record<string, unknown>)?.[k]
    if (typeof value !== 'string') return key

    if (vars) {
      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        value
      )
    }
    return value
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale: setLocaleAndStore, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
