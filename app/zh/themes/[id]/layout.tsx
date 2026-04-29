import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSiteUrl } from '@/lib/site-url'
import { LocaleOverride } from '@/components/LocaleOverride'

export const revalidate = 600

interface Props {
  children: React.ReactNode
  params: { id: string }
}

async function fetchTheme(id: string) {
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, name_zh, summary, summary_zh, category, last_active_at, first_seen_at')
    .eq('id', id)
    .maybeSingle()
  return data as
    | {
        id: string
        name: string | null
        name_zh: string | null
        summary: string | null
        summary_zh: string | null
        category: string | null
        last_active_at: string | null
        first_seen_at: string | null
      }
    | null
}

function truncate(input: string | null | undefined, max: number): string {
  if (!input) return ''
  const cleaned = input.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max - 1).trimEnd() + '…'
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const theme = await fetchTheme(params.id)
  if (!theme) {
    return { title: '主题未找到' }
  }
  const title = theme.name_zh?.trim() || theme.name?.trim() || '未命名主题'
  const descSrc = theme.summary_zh?.trim() || theme.summary?.trim() || ''
  const description =
    truncate(descSrc, 160) || `${title} — Newshock 主题雷达：催化剂、相关股票与事件追踪。`
  const canonical = `/zh/themes/${theme.id}`
  const enUrl = `/themes/${theme.id}`

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: enUrl,
        'zh-CN': canonical,
        'x-default': enUrl,
      },
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url: canonical,
      locale: 'zh_CN',
      alternateLocale: ['en_US'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function ZhThemeLayout({ children, params }: Props) {
  const theme = await fetchTheme(params.id)
  const base = getSiteUrl()

  const ldArticle = theme
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: theme.name_zh || theme.name || '主题',
        description: truncate(theme.summary_zh || theme.summary || '', 300),
        inLanguage: 'zh-CN',
        datePublished: theme.first_seen_at || undefined,
        dateModified: theme.last_active_at || undefined,
        url: `${base}/zh/themes/${params.id}`,
        publisher: {
          '@type': 'Organization',
          name: 'Newshock',
          url: base,
          logo: { '@type': 'ImageObject', url: `${base}/newshock-logo.png` },
        },
        articleSection: theme.category || undefined,
      }
    : null

  return (
    <>
      {ldArticle && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldArticle) }}
        />
      )}
      <LocaleOverride locale="zh">{children}</LocaleOverride>
    </>
  )
}
