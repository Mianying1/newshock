import { config } from 'dotenv'
config({ path: '.env.local' })

async function probe(url: string) {
  const apikey = process.env.FMP_API_KEY!
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}apikey=${apikey}`
  try {
    const res = await fetch(fullUrl)
    const text = await res.text()
    const short = text.slice(0, 300)
    console.log(`  [${res.status}] ${url.replace(/apikey=[^&]*/, 'apikey=***')}`)
    console.log(`         ${short.replace(/\n/g, ' ')}`)
  } catch (e) {
    console.log(`  [ERR] ${url} — ${(e as Error).message}`)
  }
}

async function main() {
  console.log(`=== Probing FMP endpoints for keyword-only news ===\n`)
  const base = 'https://financialmodelingprep.com'
  // Try each candidate endpoint
  await probe(`${base}/stable/news/general-latest?page=0&limit=5`)
  await probe(`${base}/stable/search-news?query=data%20center%20power&limit=5`)
  await probe(`${base}/stable/news/search?query=data%20center%20power&limit=5`)
  await probe(`${base}/api/v3/search-news?query=data%20center%20power&limit=5`)
  await probe(`${base}/api/v4/general_news?page=0`)
  await probe(`${base}/api/v4/stock_news?page=0`)
  await probe(`${base}/stable/news/stock-latest?limit=5&page=0`)
  await probe(`${base}/stable/news/press-releases?symbols=LLY&limit=2`)
}

main().catch((e) => { console.error(e); process.exit(1) })
