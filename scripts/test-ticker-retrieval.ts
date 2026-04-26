import { config } from 'dotenv'
config({ path: '.env.local' })
import { retrieveTickersByArchetype } from '@/lib/ticker-retrieval'

interface TestCase {
  archetype: string
  label: string
  expectMin: number
  mustHave: string[]
}

const TESTS: TestCase[] = [
  { archetype: 'middle_east_energy_shock', label: 'Iran Crisis · Oil Shock', expectMin: 50, mustHave: ['XOM', 'CVX', 'OXY', 'HAL', 'SLB', 'STNG'] },
  { archetype: 'ai_capex_infrastructure',  label: 'AI Capex',               expectMin: 80, mustHave: ['NVDA', 'AMD', 'MSFT', 'VRT', 'VST'] },
  { archetype: 'defense_buildup',          label: 'Defense Buildup',        expectMin: 30, mustHave: ['LMT', 'NOC', 'GD', 'RTX'] },
  { archetype: 'crypto_institutional_adoption', label: 'Crypto Institutional', expectMin: 10, mustHave: ['COIN', 'MSTR', 'MARA'] },
  { archetype: 'pharma_innovation_super_cycle', label: 'Pharma Innovation',  expectMin: 50, mustHave: ['LLY', 'PFE', 'MRK'] },
]

function fmtMc(mc: number): string {
  if (mc >= 1e12) return `${(mc / 1e12).toFixed(2)}T`
  if (mc >= 1e9) return `${(mc / 1e9).toFixed(1)}B`
  if (mc >= 1e6) return `${(mc / 1e6).toFixed(0)}M`
  return String(mc)
}

async function main() {
  const summary: { label: string; pass: boolean; count: number; missing: string[] }[] = []

  for (const t of TESTS) {
    console.log(`\n=== ${t.label}  [${t.archetype}] ===`)
    const results = await retrieveTickersByArchetype(t.archetype, { limit: 200 })
    const tickers = new Set(results.map(r => r.ticker.toUpperCase()))
    const missing = t.mustHave.filter(m => !tickers.has(m.toUpperCase()))
    const pass = results.length >= t.expectMin && missing.length === 0
    summary.push({ label: t.label, pass, count: results.length, missing })

    console.log(`recall: ${results.length}  ·  expect ≥ ${t.expectMin}  ·  missing core: [${missing.join(',') || '∅'}]`)
    console.log('top 10:')
    for (const r of results.slice(0, 10)) {
      const matched = r.matched_buckets.join('+')
      console.log(`  ${r.ticker.padEnd(7)} ${fmtMc(r.market_cap).padStart(7)}  w=${r.bucket_weight_sum.toFixed(2)}  s=${r.retrieval_score}  [${matched}]  ${r.company_name.slice(0, 38)}`)
    }
    // If any required ticker missing, show whether it exists in main DB at all (debug aid)
    if (missing.length > 0) {
      console.log(`  ⚠ missing core: ${missing.join(', ')}`)
    }
  }

  console.log('\n=== SUMMARY ===')
  for (const s of summary) {
    const tag = s.pass ? '✓' : '✗'
    console.log(`  ${tag} ${s.label.padEnd(30)} count=${s.count}  missing=[${s.missing.join(',') || '∅'}]`)
  }
  const failed = summary.filter(s => !s.pass).length
  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} failed`}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
