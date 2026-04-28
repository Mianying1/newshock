import { supabaseAdmin } from './supabase-admin'

type CompanyEntry = { symbol: string; pattern: RegExp }

const SUFFIX_RE = /[,]?\s+(Incorporated|Inc|Corporation|Corp|Companies|Company|Co|Holdings|Holding|Group|Limited|Ltd|LLC|PLC|N\.?V\.?|S\.?A\.?|Class\s+[A-C])\.?$/i

function buildPattern(rawName: string): RegExp | null {
  let cleaned = rawName.replace(/[.,&]/g, ' ').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 3; i++) {
    const stripped = cleaned.replace(SUFFIX_RE, '').trim()
    if (stripped === cleaned) break
    cleaned = stripped
  }
  if (cleaned.length < 6) return null
  const escaped = cleaned.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

let companyMapPromise: Promise<CompanyEntry[]> | null = null

export async function loadCompanyMap(): Promise<CompanyEntry[]> {
  if (companyMapPromise) return companyMapPromise
  companyMapPromise = (async () => {
    const { data } = await supabaseAdmin
      .from('tickers')
      .select('symbol, company_name')
      .not('company_name', 'is', null)
    return (data ?? []).flatMap((t: { symbol: string; company_name: string | null }) => {
      const pat = buildPattern((t.company_name ?? '').trim())
      return pat ? [{ symbol: t.symbol, pattern: pat }] : []
    })
  })()
  return companyMapPromise
}

const CASHTAG_RE = /\$([A-Z]{1,5})\b|\((?:NYSE|NASDAQ|AMEX|NYSE MKT):\s*([A-Z]{1,5})\)/g

export function extractCashtags(text: string): string[] {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  CASHTAG_RE.lastIndex = 0
  while ((m = CASHTAG_RE.exec(text)) !== null) {
    found.add(m[1] ?? m[2])
  }
  return Array.from(found)
}

export function extractCompanyNames(text: string, companyMap: CompanyEntry[]): string[] {
  const found = new Set<string>()
  for (const { symbol, pattern } of companyMap) {
    if (pattern.test(text)) found.add(symbol)
  }
  return Array.from(found)
}

export async function extractTickers(text: string): Promise<string[]> {
  const map = await loadCompanyMap()
  const out = new Set<string>([...extractCashtags(text), ...extractCompanyNames(text, map)])
  return Array.from(out)
}
