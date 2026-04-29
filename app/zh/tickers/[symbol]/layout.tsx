import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getSiteUrl } from '@/lib/site-url'
import { LocaleOverride } from '@/components/LocaleOverride'

export const revalidate = 600

interface Props {
  children: React.ReactNode
  params: { symbol: string }
}

async function fetchTicker(symbol: string) {
  const { data } = await supabaseAdmin
    .from('tickers')
    .select('symbol, company_name, sector, market_cap_usd_b, updated_at')
    .eq('symbol', symbol.toUpperCase())
    .maybeSingle()
  return data as
    | {
        symbol: string
        company_name: string | null
        sector: string | null
        market_cap_usd_b: number | null
        updated_at: string | null
      }
    | null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ticker = await fetchTicker(params.symbol)
  const upper = params.symbol.toUpperCase()
  if (!ticker) {
    return { title: `${upper} — 股票` }
  }
  const company = ticker.company_name?.trim()
  const title = company ? `${upper} — ${company}` : upper
  const description = company
    ? `${upper}（${company}）的主题敞口、催化剂与事件追踪 · Newshock`
    : `${upper} 的主题敞口、催化剂与事件追踪 · Newshock`
  const canonical = `/zh/tickers/${upper}`
  const enUrl = `/tickers/${upper}`

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

export default async function ZhTickerLayout({ children, params }: Props) {
  const ticker = await fetchTicker(params.symbol)
  const base = getSiteUrl()
  const upper = params.symbol.toUpperCase()

  const ldOrg = ticker
    ? {
        '@context': 'https://schema.org',
        '@type': 'Corporation',
        name: ticker.company_name || upper,
        tickerSymbol: upper,
        url: `${base}/zh/tickers/${upper}`,
        ...(ticker.sector ? { industry: ticker.sector } : {}),
      }
    : null

  return (
    <>
      {ldOrg && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldOrg) }}
        />
      )}
      <LocaleOverride locale="zh">{children}</LocaleOverride>
    </>
  )
}
