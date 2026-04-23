import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { join } from 'path'
config({ path: '.env.local' })

const PROJECT_REF = 'yhishejdjgkjalbnmgtb'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN missing')

const MIGRATIONS = process.argv.slice(2)
if (MIGRATIONS.length === 0) throw new Error('usage: tsx _apply-ux-migrations.ts <file1> [file2...]')

async function run(sql: string, label: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${label}: ${res.status} ${text}`)
  console.log(`✓ ${label}`)
}

async function main() {
  for (const f of MIGRATIONS) {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8')
    await run(sql, f)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
