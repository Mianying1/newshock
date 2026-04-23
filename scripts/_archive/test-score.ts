import { config } from 'dotenv'
config({ path: '.env.local' })
import { scorePendingEvents } from '@/lib/scorer'

async function main() {
  const limit = parseInt(process.argv[2] || '10', 10)
  console.log(`Scoring up to ${limit} pending events...`)
  const result = await scorePendingEvents({ limit })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
