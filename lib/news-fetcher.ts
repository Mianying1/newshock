import Parser from 'rss-parser'
import { NEWS_SOURCES, NewsSource, NewsSlot } from './news-sources'

export interface FetchedNews {
  source_id: string
  source_name: string
  headline: string
  source_url: string
  raw_content: string
  published_at: Date
  mentioned_tickers: string[]
}

export interface SourceResult {
  id: string
  fetched: number
  errors: string[]
}

const TICKER_RE = /\$([A-Z]{1,5})\b|\((?:NYSE|NASDAQ|AMEX|NYSE MKT):\s*([A-Z]{1,5})\)/g

function extractTickers(text: string): string[] {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = TICKER_RE.exec(text)) !== null) {
    found.add(m[1] ?? m[2])
  }
  return [...found]
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

const parser = new Parser({
  customFields: { item: ['media:content', 'media:thumbnail'] },
  headers: { 'User-Agent': 'Newshock/0.1 (contact@newshock.app)' },
})

export async function fetchFromSource(source: NewsSource): Promise<{ items: FetchedNews[]; errors: string[] }> {
  const errors: string[] = []
  const items: FetchedNews[] = []

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    let feed: Awaited<ReturnType<typeof parser.parseURL>>
    try {
      feed = await parser.parseURL(source.url)
    } finally {
      clearTimeout(timeout)
    }

    for (const item of feed.items) {
      const headline = stripHtml(item.title ?? '').trim()
      const url = item.link ?? ''
      if (!headline || !url) continue

      const snippet = item.contentSnippet ?? item.content ?? ''
      const raw_content = stripHtml(snippet)
      const combined = `${headline} ${raw_content}`

      items.push({
        source_id: source.id,
        source_name: source.name,
        headline,
        source_url: url,
        raw_content,
        published_at: item.pubDate ? new Date(item.pubDate) : new Date(),
        mentioned_tickers: extractTickers(combined),
      })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(msg)
    console.warn(`[news-fetcher] WARNING: ${source.id} failed — ${msg}`)
  }

  return { items, errors }
}

export async function fetchAllSources(slot?: NewsSlot): Promise<{
  items: FetchedNews[]
  sourceResults: SourceResult[]
}> {
  const sources = slot
    ? NEWS_SOURCES.filter((s) => s.priority_slots.includes(slot))
    : NEWS_SOURCES

  const results = await Promise.allSettled(sources.map((s) => fetchFromSource(s)))

  const allItems: FetchedNews[] = []
  const sourceResults: SourceResult[] = []

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    const result = results[i]

    if (result.status === 'fulfilled') {
      allItems.push(...result.value.items)
      sourceResults.push({ id: source.id, fetched: result.value.items.length, errors: result.value.errors })
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
      console.warn(`[news-fetcher] WARNING: ${source.id} rejected — ${msg}`)
      sourceResults.push({ id: source.id, fetched: 0, errors: [msg] })
    }
  }

  return { items: allItems, sourceResults }
}
