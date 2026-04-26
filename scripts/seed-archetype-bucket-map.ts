import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'node:fs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { INDUSTRY_BUCKETS } from '@/lib/industry-buckets'

interface BucketEntry { bucket: string; weight: number; reason: string }
interface Mapping {
  archetype_id: string
  archetype_name: string
  buckets: BucketEntry[]
  notes: string | null
}
interface MapFile { mappings: Mapping[] }

const SRC = '/tmp/archetype-bucket-map-v2.json'

async function main() {
  const raw = JSON.parse(readFileSync(SRC, 'utf-8')) as MapFile
  console.log(`[load] ${raw.mappings.length} archetype mappings from ${SRC}`)

  const validBuckets = new Set(Object.keys(INDUSTRY_BUCKETS))
  const rows: { archetype_name: string; industry_bucket: string; weight: number; notes: string | null }[] = []
  const issues: string[] = []

  for (const m of raw.mappings) {
    const seen = new Set<string>()
    const sorted = [...m.buckets].sort((a, b) => b.weight - a.weight)
    sorted.forEach((b, idx) => {
      if (!validBuckets.has(b.bucket)) { issues.push(`${m.archetype_id}: invalid bucket ${b.bucket}`); return }
      if (seen.has(b.bucket)) { issues.push(`${m.archetype_id}: duplicate bucket ${b.bucket}`); return }
      seen.add(b.bucket)
      // Per-bucket reason in notes; archetype-level notes appended only to the top-weight row.
      const archetypeNote = idx === 0 && m.notes ? ` | archetype: ${m.notes}` : ''
      rows.push({
        archetype_name: m.archetype_id,
        industry_bucket: b.bucket,
        weight: b.weight,
        notes: `${b.reason}${archetypeNote}`,
      })
    })
  }

  if (issues.length) {
    console.error(`[validate] ${issues.length} issues:`)
    for (const i of issues) console.error('  ' + i)
    process.exit(1)
  }
  console.log(`[validate] ok · ${rows.length} rows to insert`)

  // Idempotent: clear existing rows for the same archetypes, then bulk insert.
  const archetypeNames = [...new Set(rows.map(r => r.archetype_name))]
  const { error: delErr } = await supabaseAdmin
    .from('archetype_bucket_map')
    .delete()
    .in('archetype_name', archetypeNames)
  if (delErr) throw new Error(`delete: ${delErr.message}`)
  console.log(`[clear] removed prior rows for ${archetypeNames.length} archetypes`)

  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const { error } = await supabaseAdmin.from('archetype_bucket_map').insert(slice)
    if (error) throw new Error(`insert batch ${i / BATCH}: ${error.message}`)
    inserted += slice.length
  }
  console.log(`[insert] ${inserted} rows inserted`)

  // Total row count
  const { count, error: cntErr } = await supabaseAdmin
    .from('archetype_bucket_map')
    .select('*', { count: 'exact', head: true })
  if (cntErr) throw new Error(`count: ${cntErr.message}`)
  const distinctArchetypes = new Set(rows.map(r => r.archetype_name)).size
  const avgBuckets = (rows.length / distinctArchetypes).toFixed(1)
  console.log(`\n[summary] total table rows: ${count}`)
  console.log(`[summary] archetypes seeded: ${distinctArchetypes} · avg buckets: ${avgBuckets}`)

  // Spot-check 3 archetypes
  const samples = ['ai_capex_infrastructure', 'middle_east_energy_shock', 'crypto_institutional_adoption']
  console.log('\n=== Spot checks ===')
  for (const name of samples) {
    const { data, error } = await supabaseAdmin
      .from('archetype_bucket_map')
      .select('industry_bucket, weight, notes')
      .eq('archetype_name', name)
      .order('weight', { ascending: false })
    if (error) { console.error(`  ${name}: ${error.message}`); continue }
    console.log(`\n  [${name}] ${data!.length} rows:`)
    for (const r of data!) {
      console.log(`    ${r.industry_bucket.padEnd(30)} w=${r.weight}  ${(r.notes ?? '').slice(0, 80)}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
