const FMP_BASE = 'https://financialmodelingprep.com/stable'

export interface FMPNewsItem {
  symbol: string | null
  publishedDate: string
  publisher: string
  title: string
  image: string | null
  site: string
  text: string
  url: string
}

export async function getStockNews(
  tickers: string[],
  limit: number = 100,
  page: number = 0
): Promise<FMPNewsItem[]> {
  const params = new URLSearchParams({
    symbols: tickers.join(','),
    limit: limit.toString(),
    page: page.toString(),
    apikey: process.env.FMP_API_KEY!,
  })

  const res = await fetch(`${FMP_BASE}/news/stock?${params}`)
  if (!res.ok) {
    throw new Error(`FMP stock news failed: ${res.status} - ${await res.text()}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? data : []
}

// Paginate per-ticker with optional keyword pre-filter.
// Without keywords: stops at totalLimit (recent news only).
// With keywords: scans up to maxPages per ticker, accumulates only keyword-matching items.
// This lets the caller scan deep (e.g. 30 pages) to surface historical events efficiently.
export async function getStockNewsMultiTicker(
  tickers: string[],
  totalLimit: number = 200,
  maxPages: number = 30,
  keywords: string[] = []
): Promise<FMPNewsItem[]> {
  const allNews: FMPNewsItem[] = []
  const seen = new Set<string>()

  for (const ticker of tickers) {
    let emptyStreak = 0
    for (let page = 0; page < maxPages; page++) {
      const news = await getStockNews([ticker], 100, page)
      if (news.length === 0) {
        if (++emptyStreak >= 2) break
        continue
      }
      emptyStreak = 0

      for (const item of news) {
        if (seen.has(item.url)) continue
        seen.add(item.url)

        if (keywords.length > 0) {
          const text = ((item.title ?? '') + ' ' + (item.text ?? '')).toLowerCase()
          if (!keywords.some((kw) => text.includes(kw.toLowerCase()))) continue
        }

        allNews.push(item)
      }

      if (allNews.length >= totalLimit) break
      await new Promise((r) => setTimeout(r, 200))
    }

    if (allNews.length >= totalLimit) break
  }

  return allNews.slice(0, totalLimit)
}

/**
 * Keyword-only FMP news helper.
 * NOTE: FMP stock-latest feed only covers last 4-6 hours with pagination.
 * API caps out at ~100 pages (Maximum Quota) before reaching 90 days back.
 * Not suitable for historical backfill (90+ days).
 * Kept for potential future use (realtime keyword monitoring).
 */
export async function getStockNewsByKeywords(
  keywords: string[],
  totalLimit: number = 300,
  maxPages: number = 60,
  daysBack: number = 90,
): Promise<FMPNewsItem[]> {
  if (keywords.length === 0) return []
  const lowered = keywords.map((k) => k.toLowerCase())
  const cutoff = Date.now() - daysBack * 86400000
  const out: FMPNewsItem[] = []
  const seen = new Set<string>()
  let emptyStreak = 0
  let hitCutoff = false

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      page: String(page),
      limit: '100',
      apikey: process.env.FMP_API_KEY!,
    })
    const res = await fetch(`${FMP_BASE}/news/stock-latest?${params}`)
    if (!res.ok) throw new Error(`FMP stock-latest p${page}: ${res.status}`)
    const data = (await res.json()) as FMPNewsItem[]
    if (!Array.isArray(data) || data.length === 0) {
      if (++emptyStreak >= 2) break
      continue
    }
    emptyStreak = 0

    for (const item of data) {
      if (seen.has(item.url)) continue
      seen.add(item.url)
      const ts = new Date(item.publishedDate ?? '').getTime()
      if (Number.isFinite(ts) && ts < cutoff) { hitCutoff = true; continue }
      const text = ((item.title ?? '') + ' ' + (item.text ?? '')).toLowerCase()
      if (!lowered.some((kw) => text.includes(kw))) continue
      out.push(item)
    }

    if (out.length >= totalLimit) break
    if (hitCutoff) break  // page walked past daysBack cutoff → further pages are older
    await new Promise((r) => setTimeout(r, 200))
  }
  return out.slice(0, totalLimit)
}

export async function getGeneralNews(
  page: number = 0,
  limit: number = 20
): Promise<FMPNewsItem[]> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    apikey: process.env.FMP_API_KEY!,
  })

  const res = await fetch(`${FMP_BASE}/news/general-latest?${params}`)
  if (!res.ok) return []

  return res.json()
}

let callsThisMinute = 0
let minuteResetTime = Date.now() + 60000

export async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  if (Date.now() > minuteResetTime) {
    callsThisMinute = 0
    minuteResetTime = Date.now() + 60000
  }
  if (callsThisMinute >= 200) {
    const wait = minuteResetTime - Date.now()
    console.log(`[fmp] Rate limit reached, waiting ${wait}ms`)
    await new Promise((r) => setTimeout(r, wait))
    callsThisMinute = 0
    minuteResetTime = Date.now() + 60000
  }
  callsThisMinute++
  return fn()
}
