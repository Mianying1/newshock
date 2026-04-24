import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { data } = await supabaseAdmin.from('events').select('source_name').ilike('source_name', '%FMP%')
  const freq: Record<string, number> = {}
  for (const r of data ?? []) freq[r.source_name ?? 'null'] = (freq[r.source_name ?? 'null'] ?? 0) + 1
  console.log('FMP-matching source_name distribution:')
  for (const [k, v] of Object.entries(freq).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`)
  }

  // Also check for anything with "financial modeling" or similar aliases
  const { data: all } = await supabaseAdmin.from('events').select('source_name')
  const uniq = new Set<string>()
  for (const r of all ?? []) if (r.source_name) uniq.add(r.source_name)
  console.log(`\nAll distinct source_name (total=${uniq.size}):`)
  for (const s of [...uniq].sort()) console.log(`  ${s}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
