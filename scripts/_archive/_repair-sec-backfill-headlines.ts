import { config } from 'dotenv'
config({ path: '.env.local' })

/**
 * Repair 1,438 SEC backfill headlines to match parseHeadline contract.
 * Old: `${company} files 8-K: ${items}`
 * New: `8-K - ${company} (${cikPadded}) (Filer)`
 * CIK + company parsed from raw_content JSON.
 * Idempotent: skips rows already matching `^8-K -`.
 */

const REALTIME_FORMAT_RE = /^8-K(?:\/A)?\s*-/

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // Fetch all SEC backfill rows needing repair
  const rows: Array<{ id: string; headline: string; raw_content: string | null }> = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('id, headline, raw_content')
      .eq('source_name', 'SEC EDGAR 8-K Filings')
      .ilike('headline', '% files 8-K%')
      .range(from, from + pageSize - 1)
    if (error) { console.error(error); process.exit(1) }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  console.log(`fetched ${rows.length} rows needing repair\n`)

  let updated = 0
  let skipped = 0
  let failed = 0
  const beforeAfter: Array<{ id: string; before: string; after: string }> = []

  for (const r of rows) {
    if (REALTIME_FORMAT_RE.test(r.headline)) { skipped++; continue }
    let parsed: { cik?: string; company?: string } = {}
    try { parsed = JSON.parse(r.raw_content ?? '{}') } catch { /* fallthrough */ }
    const cik = parsed.cik
    const company = parsed.company
    if (!cik || !company) {
      failed++
      console.error(`  MISSING cik/company for id=${r.id.slice(0, 8)} raw=${(r.raw_content ?? '').slice(0, 120)}`)
      continue
    }
    const cikPadded = cik.padStart(10, '0')
    const newHeadline = `8-K - ${company} (${cikPadded}) (Filer)`
    const { error } = await supabaseAdmin.from('events').update({ headline: newHeadline }).eq('id', r.id)
    if (error) {
      failed++
      console.error(`  UPDATE ERROR id=${r.id.slice(0, 8)}: ${error.message}`)
      continue
    }
    updated++
    if (beforeAfter.length < 5) beforeAfter.push({ id: r.id, before: r.headline, after: newHeadline })
    if (updated % 200 === 0) console.log(`  progress ${updated}/${rows.length}`)
  }

  // Post-verify counts
  const { count: stillOld } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .ilike('headline', '% files 8-K%')
  const { count: nowNew } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .ilike('headline', '8-K -%')

  console.log(`\n=== Summary ===`)
  console.log(`updated:  ${updated}`)
  console.log(`skipped:  ${skipped} (already correct)`)
  console.log(`failed:   ${failed}`)
  console.log(`\nPost-verify:`)
  console.log(`  rows still in old format: ${stillOld}`)
  console.log(`  rows now in new format:   ${nowNew}`)

  console.log(`\n=== First 5 before/after ===`)
  for (const ba of beforeAfter) {
    console.log(`\n  id=${ba.id.slice(0, 8)}`)
    console.log(`  BEFORE: ${ba.before}`)
    console.log(`  AFTER:  ${ba.after}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
