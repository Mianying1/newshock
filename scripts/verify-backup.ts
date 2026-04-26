import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'

const PAIRS: Array<{ source: string; backup: string; required: boolean }> = [
  { source: 'theme_recommendations', backup: 'theme_recommendations_backup_20260425', required: true },
  { source: 'themes',                backup: 'themes_backup_20260425',                required: true },
  { source: 'tickers',               backup: 'tickers_backup_20260425',               required: true },
  { source: 'event_scores',          backup: 'event_scores_backup_20260425',          required: true },
  { source: 'theme_archetypes',      backup: 'theme_archetypes_backup_20260425',      required: false },
  { source: 'theme_conviction',      backup: 'theme_conviction_backup_20260425',      required: false },
]

async function countRows(table: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) return null
  return count ?? 0
}

async function sample(table: string, n = 5): Promise<unknown[] | null> {
  const { data, error } = await supabaseAdmin.from(table).select('*').limit(n)
  if (error) return null
  return data ?? []
}

async function main() {
  let allOk = true
  console.log('table'.padEnd(34), 'source'.padStart(8), 'backup'.padStart(8), 'status')
  console.log('-'.repeat(70))

  for (const { source, backup, required } of PAIRS) {
    const srcCount = await countRows(source)
    const bakCount = await countRows(backup)

    if (srcCount === null && bakCount === null) {
      const tag = required ? 'FAIL (source missing)' : 'skip (optional, source absent)'
      console.log(source.padEnd(34), '-'.padStart(8), '-'.padStart(8), tag)
      if (required) allOk = false
      continue
    }
    if (bakCount === null) {
      console.log(source.padEnd(34), String(srcCount).padStart(8), '-'.padStart(8), 'FAIL (backup missing)')
      if (required) allOk = false
      continue
    }
    if (srcCount === null) {
      console.log(source.padEnd(34), '-'.padStart(8), String(bakCount).padStart(8), 'WARN (source gone after backup)')
      continue
    }

    const match = srcCount === bakCount
    const status = match ? 'OK' : `MISMATCH (delta=${srcCount - bakCount})`
    console.log(source.padEnd(34), String(srcCount).padStart(8), String(bakCount).padStart(8), status)
    if (!match) allOk = false

    const rows = await sample(backup, 5)
    const colCount = rows && rows.length > 0 ? Object.keys(rows[0] as object).length : 0
    if (rows && rows.length > 0) {
      console.log(`  sample: ${rows.length} rows · ${colCount} columns`)
    } else if (srcCount === 0) {
      console.log('  sample: source is empty (0 rows) — backup is also empty, OK')
    } else {
      console.log('  sample: WARN — backup has 0 sampled rows but count > 0')
    }
  }

  console.log('-'.repeat(70))
  console.log(allOk ? 'RESULT: all required backups verified' : 'RESULT: FAILED — see above')
  process.exit(allOk ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
