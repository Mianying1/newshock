'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface RelatedTheme {
  id: string
  name: string
  name_zh: string | null
  category: string
  event_count: number
}

interface Narrative {
  id: string
  title: string
  title_zh: string | null
  description: string
  description_zh: string | null
  aggregate_ticker_count: number | null
  top_chokepoint_tickers: string[] | null
  related_themes: RelatedTheme[]
  rank: number
  created_at?: string
  updated_at?: string
  review_status?: string | null
}

const CATEGORY_TAG: Record<string, { cls: string; labelKey: string }> = {
  geopolitical: { cls: 'geo', labelKey: 'categories.geopolitics' },
  geopolitics: { cls: 'geo', labelKey: 'categories.geopolitics' },
  ai_semi: { cls: 'ai', labelKey: 'categories.ai_semi' },
  tech_breakthrough: { cls: 'ai', labelKey: 'categories.tech_breakthrough' },
  supply_chain: { cls: 'supp', labelKey: 'categories.supply_chain' },
  pharma: { cls: 'pha', labelKey: 'categories.pharma' },
  defense: { cls: 'def', labelKey: 'categories.defense' },
  energy: { cls: 'ene', labelKey: 'categories.energy' },
  materials: { cls: 'mat', labelKey: 'categories.materials' },
  macro_monetary: { cls: 'mun', labelKey: 'categories.macro_monetary' },
}

function AISparkIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 3l3 3 3-3M3 9l3-3 3 3" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 6l3 3 5-7" />
    </svg>
  )
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function MarketNarratives() {
  const { t, locale } = useI18n()
  const { data } = useSWR<{ narratives: Narrative[] }>('/api/narratives', fetcher)

  if (!data?.narratives || data.narratives.length === 0) return null

  const narratives = data.narratives.slice(0, 3)
  const lastUpdated = narratives[0]?.updated_at ?? narratives[0]?.created_at

  return (
    <>
      <div className="sec-label">
        <span className="l">{t('narratives.heading')}</span>
        <span className="r">
          {t('narratives.synthesis_meta', { time: formatTime(lastUpdated) })}
        </span>
      </div>
      <div className="narr-grid">
        {narratives.map((n) => {
          const title = pickField(locale, n.title, n.title_zh)
          const description = pickField(locale, n.description, n.description_zh)
          const primaryTheme = n.related_themes[0]
          const catMeta =
            (primaryTheme && CATEGORY_TAG[primaryTheme.category]) ?? null
          const isReviewed =
            n.review_status === 'reviewed' || n.review_status === 'approved'

          return (
            <div className="narr-card" key={n.id}>
              <div className="narr-top">
                {catMeta ? (
                  <span className={`tag ${catMeta.cls}`}>{t(catMeta.labelKey)}</span>
                ) : (
                  <span className="tag low">{t('narratives.narrative')}</span>
                )}
                <span className={`mark ${isReviewed ? 'curated' : 'ai'}`}>
                  {isReviewed ? <CheckIcon /> : <AISparkIcon />}
                  {isReviewed
                    ? t('narratives.mark_reviewed')
                    : t('narratives.mark_ai')}
                </span>
                <span className="t-time">{formatTime(n.updated_at ?? n.created_at)}</span>
              </div>
              <div className="narr-title">{title}</div>
              <div className="narr-body">{description}</div>
              <div className="narr-foot">
                <div className="links">
                  {n.related_themes.slice(0, 4).map((th, i) => {
                    const themeName = pickField(locale, th.name, th.name_zh)
                    return (
                      <span key={th.id}>
                        <Link href={`/themes/${th.id}`}>
                          {themeName.split(' · ')[0]}
                        </Link>
                        {i < Math.min(3, n.related_themes.length - 1) && (
                          <span className="sep"> · </span>
                        )}
                      </span>
                    )
                  })}
                </div>
                <span>{t('narratives.themes', { n: n.related_themes.length })}</span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
