import { config } from 'dotenv'
config({ path: '.env.local' })
import { classifyPendingEvents } from '@/lib/classifier'

async function main() {
  const limit = parseInt(process.argv[2] || '10', 10)
  console.log(`Classifying up to ${limit} pending events...`)
  const result = await classifyPendingEvents({ limit })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
