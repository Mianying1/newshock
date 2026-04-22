'use client'
import { useI18n } from './i18n-context'

export function useField<T extends object>(
  item: T | null | undefined,
  field: keyof T & string
): string {
  const { locale } = useI18n()
  if (!item) return ''
  const rec = item as Record<string, unknown>
  const en = rec[field]
  const zh = rec[`${field}_zh`]
  const enStr = typeof en === 'string' ? en : ''
  const zhStr = typeof zh === 'string' ? zh : ''
  if (locale === 'zh') return zhStr || enStr
  return enStr
}

export function useJsonField<T extends object, R = unknown>(
  item: T | null | undefined,
  field: keyof T & string
): R | null {
  const { locale } = useI18n()
  if (!item) return null
  const rec = item as Record<string, unknown>
  const en = rec[field] as R | undefined
  const zh = rec[`${field}_zh`] as R | undefined
  if (locale === 'zh' && zh) return zh
  return en ?? null
}

export function pickField(
  locale: 'en' | 'zh',
  en: string | null | undefined,
  zh: string | null | undefined
): string {
  if (locale === 'zh') return zh || en || ''
  return en || ''
}
