import { config } from 'dotenv'
config({ path: '.env.localc' })

async function main() {
  const limit = parseInt(process.argv[2] ?? '50', 10)
  const { generateThemesForPendingEvents } = await import('@/lib/theme-generator')
  console.log(`Generating themes for up to ${limit} pending events...`)
  const result = await generateThemesForPendingEvents({ limit, rate_limit: 3 })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
