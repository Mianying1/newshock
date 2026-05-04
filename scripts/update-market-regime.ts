import { config } from 'dotenv'
config({ path: '.env.local' })

import fs from 'fs'
import path from 'path'

async function main() {
  const { updateRegimeSnapshot } = await import('../lib/market-regime')
  type ManualInputs = import('../lib/market-regime').ManualInputs

  const manualPath = path.resolve(process.cwd(), 'data/manual-regime-inputs.json')
  const manual = JSON.parse(fs.readFileSync(manualPath, 'utf8')) as ManualInputs

  console.log(`Using manual inputs (updated ${manual.updated_at})`)
  console.log('Fetching FRED + computing scores...')

  const { snapshot_date, scores } = await updateRegimeSnapshot(manual)

  console.log(`\n=== Market Regime ${snapshot_date} ===`)
  console.log(`Total: ${scores.total}/60 · ${scores.label} · ${scores.guidance}`)
  console.log('')
  console.log(`  Earnings   ${scores.earnings.score}/10  · ${scores.earnings.reasoning}`)
  console.log(`  Valuation  ${scores.valuation.score}/10  · ${scores.valuation.reasoning}`)
  console.log(`  Fed        ${scores.fed.score}/10  · ${scores.fed.reasoning}`)
  console.log(`  Economic   ${scores.economic.score}/10  · ${scores.economic.reasoning}`)
  console.log(`  Credit     ${scores.credit.score}/10  · ${scores.credit.reasoning}`)
  console.log(`  Sentiment  ${scores.sentiment.score}/10  · ${scores.sentiment.reasoning}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
