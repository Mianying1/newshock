import { config } from 'dotenv'
config({ path: '.env.local' })

import { generateThemesForPendingEvents } from '@/lib/theme-generator'

async function main() {
  const limit = parseInt(process.argv[2] ?? '20', 10)
  console.log(`Generating themes for up to ${limit} pending events...`)
  const result = await generateThemesForPendingEvents({ limit, rate_limit: 5 })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
