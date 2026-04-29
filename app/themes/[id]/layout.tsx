import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSiteUrl } from '@/lib/site-url'

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
    return { title: 'Theme not found' }
  }
  const title = theme.name?.trim() || theme.name_zh?.trim() || 'Untitled theme'
  const descSrc = theme.summary?.trim() || theme.summary_zh?.trim() || ''
  const description = truncate(descSrc, 160) ||
    `${title} — thematic radar, catalysts, and ticker exposure on Newshock.`
  const canonical = `/themes/${theme.id}`
  const zhUrl = `/zh/themes/${theme.id}`

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: canonical,
        'zh-CN': zhUrl,
        'x-default': canonical,
      },
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url: canonical,
      locale: 'en_US',
      alternateLocale: ['zh_CN'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function ThemeLayout({ children, params }: Props) {
  const theme = await fetchTheme(params.id)
  const base = getSiteUrl()

  const ldArticle = theme
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: theme.name || theme.name_zh || 'Theme',
        description: truncate(theme.summary || theme.summary_zh || '', 300),
        inLanguage: 'en',
        datePublished: theme.first_seen_at || undefined,
        dateModified: theme.last_active_at || undefined,
        url: `${base}/themes/${params.id}`,
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
      {children}
    </>
  )
}
