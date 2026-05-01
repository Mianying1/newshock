'use client'
import { useI18n } from './i18n-context'

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uac00-\ud7af]/g

// Some EN columns contain CJK content (data mis-storage). For EN locale we
// suppress those so the consumer's `{value && ...}` falls through to nothing
// rather than rendering Chinese in the English UI.
function looksLikeCjk(s: string): boolean {
  if (!s) return false
  const matches = s.match(CJK_RE)
  if (!matches) return false
  return matches.length / s.length > 0.3
}

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
  if (enStr && looksLikeCjk(enStr)) return ''
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
  const enStr = en || ''
  if (enStr && looksLikeCjk(enStr)) return ''
  return enStr
}
