const PUBLISHER_PATTERNS: Record<string, string> = {
  'reuters.com': 'Reuters',
  'bloomberg.com': 'Bloomberg',
  'ft.com': 'Financial Times',
  'wsj.com': 'WSJ',
  'cnbc.com': 'CNBC',
  'nytimes.com': 'NYT',
  'sec.gov': 'SEC',
  'coindesk.com': 'CoinDesk',
  'asia.nikkei.com': 'Nikkei Asia',
  'nikkei.com': 'Nikkei',
  'apnews.com': 'AP News',
  'fortune.com': 'Fortune',
  'businesswire.com': 'BusinessWire',
  'prnewswire.com': 'PR Newswire',
  'globenewswire.com': 'GlobeNewswire',
  'investopedia.com': 'Investopedia',
  'marketbeat.com': 'MarketBeat',
  'benzinga.com': 'Benzinga',
  'pymnts.com': 'PYMNTS',
  '247wallst.com': '24/7 Wall St',
  'electrek.co': 'Electrek',
  'defensenews.com': 'Defense News',
  'barrons.com': "Barron's",
  'marketwatch.com': 'MarketWatch',
  'seekingalpha.com': 'Seeking Alpha',
  'theinformation.com': 'The Information',
  'axios.com': 'Axios',
  'theverge.com': 'The Verge',
  'techcrunch.com': 'TechCrunch',
  'yahoo.com': 'Yahoo Finance',
  'forbes.com': 'Forbes',
  'fool.com': 'Motley Fool',
  'gurufocus.com': 'GuruFocus',
  'investors.com': "Investor's Business Daily",
  'proactiveinvestors.com': 'Proactive',
}

export function getDisplayPublisher(
  sourceName: string | null | undefined,
  sourceUrl: string | null | undefined
): string {
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl)
      const hostname = url.hostname.replace(/^www\./, '')
      for (const [pattern, name] of Object.entries(PUBLISHER_PATTERNS)) {
        if (hostname.includes(pattern)) return name
      }
    } catch {
      // ignore, fall through to source_name heuristics
    }
  }

  if (sourceName) {
    if (sourceName.includes('SEC EDGAR') || sourceName.startsWith('SEC ')) return 'SEC'
    if (sourceName.startsWith('FMP Backfill')) return 'Press'
    if (sourceName.startsWith('Google News')) return 'Press'
    return sourceName
  }

  return 'Press'
}
