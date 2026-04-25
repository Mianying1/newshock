export type NewsSlot = 'asia_eu' | 'eu_us_mid' | 'us_close'
export type NewsCategory = 'sec_filings' | 'general_news' | 'tech' | 'asia' | 'europe' | 'pharma' | 'defense' | 'crypto' | 'ev'

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
    // Tightened 2026-04-24: original single-word triggers ("AI", "chip export")
    // were polluting Allied Chip Export and AI Capex themes with broad noise.
    // Replaced with multi-word phrases that require narrative-specific context;
    // negatives strip review/opinion/launch-event chatter.
    id: 'google_news_ai_semi',
    name: 'Google News: AI/Semi Keywords',
    url:
      'https://news.google.com/rss/search?q=' +
      encodeURIComponent(
        '("AI capex" OR "datacenter capex" OR "AI infrastructure spending" OR ' +
        '"hyperscaler spending" OR "AI server orders" OR "GPU procurement" OR ' +
        '"chip export controls" OR "semiconductor export ban" OR "CHIPS Act" OR ' +
        '"AI datacenter buildout" OR "neocloud capex") ' +
        '-review -opinion -book -launch -keynote -CES -conference'
      ) +
      '&hl=en-US&gl=US&ceid=US:en',
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
  // Step 5: Diversified sector sources (AgWeb 403 SKIPPED, OilPrice 404 SKIPPED, Reuters Tech feed sunset)
  {
    id: 'fiercepharma',
    name: 'FiercePharma',
    url: 'https://www.fiercepharma.com/rss/xml',
    category: 'pharma',
    priority_slots: ['eu_us_mid', 'us_close'],
  },
  {
    id: 'defense_news',
    name: 'Defense News',
    url: 'https://www.defensenews.com/arc/outboundfeeds/rss/',
    category: 'defense',
    priority_slots: ['eu_us_mid', 'us_close'],
  },
  {
    id: 'coindesk',
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'crypto',
    priority_slots: ['asia_eu', 'eu_us_mid', 'us_close'],
  },
  {
    id: 'electrek',
    name: 'Electrek',
    url: 'https://electrek.co/feed/',
    category: 'ev',
    priority_slots: ['eu_us_mid', 'us_close'],
  },
  // Step 6: US aggregate sources (AP Business RSS returns HTML — SKIPPED)
  {
    id: 'cnbc_top',
    name: 'CNBC Top News',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147',
    category: 'general_news',
    priority_slots: ['asia_eu', 'eu_us_mid', 'us_close'],
  },
  {
    id: 'yahoo_finance',
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    category: 'general_news',
    priority_slots: ['asia_eu', 'eu_us_mid', 'us_close'],
  },
  {
    id: 'marketwatch_top',
    name: 'MarketWatch Top Stories',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    category: 'general_news',
    priority_slots: ['eu_us_mid', 'us_close'],
  },
  {
    id: 'seeking_alpha',
    name: 'Seeking Alpha Market News',
    url: 'https://seekingalpha.com/market_currents.xml',
    category: 'general_news',
    priority_slots: ['asia_eu', 'eu_us_mid', 'us_close'],
  },
]
