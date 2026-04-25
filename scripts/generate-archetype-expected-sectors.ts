// scripts/generate-archetype-expected-sectors.ts
//
// One-shot job. For every active archetype, ask Haiku which sectors from
// SECTOR_VOCAB legitimately house tickers in that theme. Persist to
// theme_archetypes.expected_sectors. Idempotent: skips archetypes that
// already have a non-empty list unless --force is passed.
//
// Run: npx tsx scripts/generate-archetype-expected-sectors.ts [--force] [--dry-run]
import { config } from 'dotenv'
config({ path: '.env.local' })
import pLimit from 'p-limit'
import { SECTOR_VOCAB } from '../lib/sector-normalize'

interface ArchetypeRow {
  id: string
  name: string
  category: string | null
  description: string | null
  typical_tickers: { tier1?: string[]; tier2?: string[]; tier3?: string[] } | null
  expected_sectors: string[] | null
}

interface Verdict {
  expected_sectors: string[]
  reasoning: string
}

async function main() {
  const force = process.argv.includes('--force')
  const dryRun = process.argv.includes('--dry-run')
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_HAIKU } = await import('../lib/anthropic')

  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, description, typical_tickers, expected_sectors')
    .eq('is_active', true)
    .order('id')
  if (error) throw error
  const archs = (data ?? []) as ArchetypeRow[]

  const targets = force
    ? archs
    : archs.filter((a) => !a.expected_sectors || a.expected_sectors.length === 0)
  console.log(`Archetypes total: ${archs.length}`)
  console.log(`To process:        ${targets.length}${force ? ' (force)' : ''}`)
  if (dryRun) console.log('DRY RUN — no DB writes.')

  const limit = pLimit(4)
  const verdicts: Array<{ id: string; v: Verdict | null; raw: string }> = []
  let done = 0
  let totalCostUsd = 0

  await Promise.all(
    targets.map((a) =>
      limit(async () => {
        const tier1 = a.typical_tickers?.tier1?.slice(0, 8).join(', ') ?? '(none)'
        const tier2 = a.typical_tickers?.tier2?.slice(0, 8).join(', ') ?? '(none)'
        const prompt =
          `Archetype: ${a.id}\n` +
          `Name: ${a.name}\n` +
          `Category: ${a.category ?? '(none)'}\n` +
          `Description: ${(a.description ?? '').slice(0, 600)}\n` +
          `Typical tier-1 tickers: ${tier1}\n` +
          `Typical tier-2 tickers: ${tier2}\n\n` +
          `Pick the SECTORS (from the vocabulary below) that legitimately house\n` +
          `tickers in this theme. Be inclusive of natural 2nd-order plays\n` +
          `(e.g. an AI capex theme includes 'power_data_center' and 'utilities',\n` +
          `not just 'semiconductors'). Be EXCLUSIVE of unrelated sectors\n` +
          `(e.g. defense theme should NOT include 'pharma' just because some\n` +
          `defense companies have biotech subsidiaries).\n\n` +
          `Vocabulary (pick 3-12 from this list, no others):\n` +
          SECTOR_VOCAB.map((s) => `  - ${s}`).join('\n') +
          `\n\nReturn STRICT JSON ONLY, no markdown:\n` +
          `{\n` +
          `  "expected_sectors": ["sector1", "sector2", ...],\n` +
          `  "reasoning": "1-2 sentences explaining the picks"\n` +
          `}`
        try {
          const resp = await anthropic.messages.create({
            model: MODEL_HAIKU,
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
          })
          const text = resp.content
            .filter((x: any) => x.type === 'text')
            .map((x: any) => x.text)
            .join('')
          const m = text.match(/\{[\s\S]*\}/)
          if (!m) {
            verdicts.push({ id: a.id, v: null, raw: text })
            return
          }
          const json = JSON.parse(m[0]) as Verdict
          // Filter to vocabulary
          const vocab = new Set(SECTOR_VOCAB as readonly string[])
          json.expected_sectors = (json.expected_sectors ?? []).filter((s) => vocab.has(s))
          verdicts.push({ id: a.id, v: json, raw: text })
          // Haiku 4.5 list price (rough): $0.80/Mtok in, $4/Mtok out
          totalCostUsd += ((resp.usage?.input_tokens ?? 0) * 0.8 + (resp.usage?.output_tokens ?? 0) * 4) / 1_000_000
        } catch (err) {
          verdicts.push({ id: a.id, v: null, raw: `error: ${err instanceof Error ? err.message : String(err)}` })
        }
        done++
        if (done % 5 === 0) console.log(`  ${done}/${targets.length}`)
      })
    )
  )

  console.log(`\nLLM cost: $${totalCostUsd.toFixed(3)}\n`)

  // Print summary
  const failures = verdicts.filter((x) => !x.v || x.v.expected_sectors.length === 0)
  console.log(`OK:        ${verdicts.length - failures.length}`)
  console.log(`Failures:  ${failures.length}`)
  for (const f of failures) console.log(`  ! ${f.id}: ${f.raw.slice(0, 200)}`)

  console.log('\n--- Verdicts ---')
  for (const v of verdicts.sort((a, b) => a.id.localeCompare(b.id))) {
    if (!v.v) continue
    console.log(`  ${v.id.padEnd(42)} → ${v.v.expected_sectors.join(', ')}`)
  }

  if (dryRun) {
    console.log('\nDRY RUN — no DB writes performed.')
    return
  }

  // Apply
  let applied = 0
  for (const { id, v } of verdicts) {
    if (!v || v.expected_sectors.length === 0) continue
    const { error: updErr } = await supabaseAdmin
      .from('theme_archetypes')
      .update({ expected_sectors: v.expected_sectors })
      .eq('id', id)
    if (updErr) console.error(`  UPDATE ${id} failed: ${updErr.message}`)
    else applied++
  }
  console.log(`\nApplied to DB: ${applied}/${verdicts.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
