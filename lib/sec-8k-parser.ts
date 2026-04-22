const SEC_USER_AGENT = 'Newshock/0.1 (contact@newshock.app)'

export interface SEC8KContext {
  cik: string
  company_name: string
  ticker: string | null
  accession_number: string | null
  items: string[]
}

const HEADLINE_RE = /^8-K(?:\/A)?\s*-\s*(.+?)\s*\((\d{5,10})\)\s*\(Filer\)\s*$/

export function parseHeadline(headline: string): { cik: string; company: string } | null {
  const m = HEADLINE_RE.exec(headline.trim())
  if (!m) return null
  return { company: m[1].trim(), cik: m[2].padStart(10, '0') }
}

const ACCESSION_RE = /(\d{10}-\d{2}-\d{6})/

export function parseAccession(sourceUrl: string): string | null {
  const m = ACCESSION_RE.exec(sourceUrl)
  return m ? m[1] : null
}

interface SubmissionsResponse {
  cik?: string
  name?: string
  tickers?: string[]
  filings?: {
    recent?: {
      accessionNumber?: string[]
      items?: string[]
      form?: string[]
      filingDate?: string[]
    }
  }
}

const submissionsCache = new Map<string, SubmissionsResponse | null>()

export async function fetchSubmissions(cik: string): Promise<SubmissionsResponse | null> {
  const padded = cik.padStart(10, '0')
  if (submissionsCache.has(padded)) return submissionsCache.get(padded) ?? null
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' } })
    if (!res.ok) {
      submissionsCache.set(padded, null)
      return null
    }
    const body = (await res.json()) as SubmissionsResponse
    submissionsCache.set(padded, body)
    return body
  } catch {
    submissionsCache.set(padded, null)
    return null
  }
}

export function lookupItemsForAccession(
  submissions: SubmissionsResponse,
  accessionNumber: string
): string[] {
  const recent = submissions.filings?.recent
  if (!recent?.accessionNumber || !recent.items) return []
  const idx = recent.accessionNumber.indexOf(accessionNumber)
  if (idx === -1) return []
  const raw = recent.items[idx] ?? ''
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export async function resolve8KContext(event: {
  headline: string
  source_url: string | null
}): Promise<SEC8KContext | null> {
  const parsed = parseHeadline(event.headline)
  if (!parsed) return null

  const accession = event.source_url ? parseAccession(event.source_url) : null
  const submissions = await fetchSubmissions(parsed.cik)

  const ticker = submissions?.tickers?.[0] ?? null
  const items = submissions && accession ? lookupItemsForAccession(submissions, accession) : []
  const company_name = submissions?.name ?? parsed.company

  return {
    cik: parsed.cik,
    company_name,
    ticker,
    accession_number: accession,
    items,
  }
}

export const ITEM_LABELS: Record<string, string> = {
  '1.01': 'Material Definitive Agreement',
  '1.02': 'Termination of Material Definitive Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '2.01': 'Completion of Acquisition or Disposition',
  '2.02': 'Results of Operations',
  '2.03': 'Creation of Material Off-Balance-Sheet Arrangement',
  '2.04': 'Triggering Events',
  '2.05': 'Costs Associated with Exit or Disposal',
  '2.06': 'Material Impairments',
  '3.01': 'Listing Standards / Transfer of Listing',
  '3.02': 'Unregistered Sales of Equity',
  '3.03': 'Material Modification to Rights of Security Holders',
  '4.01': 'Changes in Registrant Accountant',
  '4.02': 'Non-Reliance on Prior Financials',
  '5.01': 'Changes in Control',
  '5.02': 'Departure/Election of Directors',
  '5.03': 'Amendments to Articles/Bylaws',
  '5.07': 'Submission of Matters to a Vote',
  '5.08': 'Shareholder Director Nominations',
  '6.03': 'Material Modification of Rights of Security Holders',
  '7.01': 'Regulation FD Disclosure',
  '8.01': 'Other Events',
  '9.01': 'Financial Statements and Exhibits',
}

export const ITEM_MATERIALITY: Record<string, 'high' | 'medium' | 'low'> = {
  '1.01': 'high',
  '1.02': 'high',
  '1.03': 'high',
  '2.01': 'high',
  '2.02': 'medium',
  '2.05': 'medium',
  '2.06': 'high',
  '3.01': 'medium',
  '3.02': 'medium',
  '4.02': 'high',
  '5.01': 'high',
  '5.02': 'low',
  '5.03': 'low',
  '5.07': 'low',
  '7.01': 'medium',
  '8.01': 'medium',
  '9.01': 'low',
}

export function classifyItemsMateriality(items: string[]): 'high' | 'medium' | 'low' {
  let best: 'high' | 'medium' | 'low' = 'low'
  for (const it of items) {
    const m = ITEM_MATERIALITY[it]
    if (m === 'high') return 'high'
    if (m === 'medium') best = 'medium'
  }
  return best
}
