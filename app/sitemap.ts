import type { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSiteUrl } from '@/lib/site-url'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/themes`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/tickers`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/tickers/ranked`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/hot-tickers`, lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}/events`, lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
  ]

  const [themesRes, tickersRes] = await Promise.all([
    supabaseAdmin.from('themes').select('id, last_active_at').limit(5000),
    supabaseAdmin.from('tickers').select('symbol, updated_at').limit(5000),
  ])

  const themeEntries: MetadataRoute.Sitemap = (themesRes.data ?? []).flatMap((t) => {
    const lastModified = t.last_active_at ? new Date(t.last_active_at) : now
    const enUrl = `${base}/themes/${t.id}`
    const zhUrl = `${base}/zh/themes/${t.id}`
    const alternates = { languages: { en: enUrl, 'zh-CN': zhUrl } }
    return [
      { url: enUrl, lastModified, changeFrequency: 'daily' as const, priority: 0.7, alternates },
      { url: zhUrl, lastModified, changeFrequency: 'daily' as const, priority: 0.7, alternates },
    ]
  })

  const tickerEntries: MetadataRoute.Sitemap = (tickersRes.data ?? []).flatMap((t) => {
    const lastModified = t.updated_at ? new Date(t.updated_at) : now
    const enUrl = `${base}/tickers/${t.symbol}`
    const zhUrl = `${base}/zh/tickers/${t.symbol}`
    const alternates = { languages: { en: enUrl, 'zh-CN': zhUrl } }
    return [
      { url: enUrl, lastModified, changeFrequency: 'daily' as const, priority: 0.6, alternates },
      { url: zhUrl, lastModified, changeFrequency: 'daily' as const, priority: 0.6, alternates },
    ]
  })

  return [...staticEntries, ...themeEntries, ...tickerEntries]
}
