export type NewsSlot = 'asia_eu' | 'eu_us_mid' | 'us_close'
export type NewsCategory = 'sec_filings' | 'general_news' | 'tech' | 'asia' | 'europe'

export interface NewsSource {
  id: string
  name: string
  url: string
  category: NewsCategory
  priority_slots: NewsSlot[]
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'sec_edgar_8k',
    name: 'SEC EDGAR 8-K Filings',
    url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=40&output=atom',
    category: 'sec_filings',
    priority_slots: ['eu_us_mid', 'us_close'],
  },
  {
    id: 'google_news_ai_semi',
    name: 'Google News: AI/Semi Keywords',
    url: 'https://news.google.com/rss/search?q=(gigawatt+OR+%22AI+data+center%22+OR+%22chip+export%22+OR+%22strategic+investment%22+semiconductor)&hl=en-US&gl=US&ceid=US:en',
    category: 'general_news',
    priority_slots: ['asia_eu', 'eu_us_mid', 'us_close'],
  },
  {
    id: 'ft_home',
    name: 'Financial Times',
    url: 'https://www.ft.com/rss/home',
    category: 'europe',
    priority_slots: ['asia_eu', 'eu_us_mid'],
  },
  {
    id: 'nikkei_asia',
    name: 'Nikkei Asia',
    url: 'https://asia.nikkei.com/rss/feed/nar',
    category: 'asia',
    priority_slots: ['asia_eu'],
  },
  {
    id: 'reuters_tech',
    name: 'Reuters Tech',
    url: 'https://feeds.reuters.com/reuters/technologyNews',
    category: 'tech',
    priority_slots: ['eu_us_mid', 'us_close'],
  },
]
