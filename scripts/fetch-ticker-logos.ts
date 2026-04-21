import { config } from 'dotenv'
config({ path: '.env.local' })

const FMP_API_KEY = process.env.FMP_API_KEY!

if (!FMP_API_KEY) {
  console.error('FMP_API_KEY missing in .env.local')
  process.exit(1)
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: tickers, error } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .is('logo_url', null)

  if (error || !tickers) {
    console.error('Failed to fetch tickers:', error)
    return
  }

  console.log(`Fetching logos for ${tickers.length} tickers...`)

  let ok = 0
  let fail = 0
  const failedSymbols: string[] = []

  for (const t of tickers) {
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/profile?symbol=${t.symbol}&apikey=${FMP_API_KEY}`
      )
      const logoUrl: string | null = res.ok ? ((await res.json())[0]?.image ?? null) : null

      if (logoUrl) {
        const { error: updateErr } = await supabaseAdmin
          .from('tickers')
          .update({ logo_url: logoUrl })
          .eq('symbol', t.symbol)

        if (updateErr) {
          console.log(`  ⚠️  ${t.symbol} (fetched but DB update failed: ${updateErr.message})`)
          fail++
          failedSymbols.push(t.symbol)
        } else {
          ok++
          if (ok % 20 === 0) console.log(`  progress: ${ok}/${tickers.length}`)
        }
      } else {
        fail++
        failedSymbols.push(t.symbol)
      }
    } catch {
      fail++
      failedSymbols.push(t.symbol)
    }

    // 200ms rate limit (FMP 300 req/min)
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\n=== Done ===`)
  console.log(`✅ Success: ${ok}`)
  console.log(`❌ Failed:  ${fail}`)
  if (failedSymbols.length > 0) {
    console.log(`Failed symbols: ${failedSymbols.join(', ')}`)
  }
}

main().catch(console.error)
