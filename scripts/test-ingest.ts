import { runIngest } from '@/lib/ingest'
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const slot = (process.argv[2] as any) || 'eu_us_mid'
  const per_source_limit = parseInt(process.argv[3] || '15', 10)

  console.log(`Running ingest: slot=${slot}, per_source_limit=${per_source_limit}`)
  const result = await runIngest({ slot, per_source_limit })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
