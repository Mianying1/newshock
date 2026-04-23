import { config } from 'dotenv'
config({ path: '.env.local' })

type U = {
  id: string
  name: string
  theme_strength_score: number | null
  expected_coverage: { angles: Array<{ key: string; label_en: string; label_zh: string; description: string; example_tickers?: string[] }> } | null
  coverage_generated_at: string | null
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, theme_strength_score, expected_coverage, coverage_generated_at')
    .eq('theme_tier', 'umbrella')
    .order('theme_strength_score', { ascending: false })
  const umbs = (data ?? []) as U[]

  console.log('=== expected_coverage verification ===\n')
  let withCov = 0, totalAngles = 0
  for (const u of umbs) {
    const n = u.expected_coverage?.angles?.length ?? 0
    if (n > 0) { withCov++; totalAngles += n }
    console.log(`${(u.theme_strength_score ?? 0).toString().padStart(3)} · angles=${n.toString().padStart(2)} · ${u.name}`)
  }
  console.log(`\n${withCov}/${umbs.length} umbrellas have coverage · total angles=${totalAngles} · avg=${(totalAngles / Math.max(withCov, 1)).toFixed(1)}`)

  // Sample first umbrella with coverage
  const sample = umbs.find((u) => u.expected_coverage?.angles?.length)
  if (sample) {
    console.log(`\n--- Sample: ${sample.name} ---`)
    for (const a of sample.expected_coverage!.angles) {
      console.log(`  · ${a.key} · ${a.label_en} / ${a.label_zh}`)
      console.log(`    ${a.description.slice(0, 120)}`)
      console.log(`    tickers: ${(a.example_tickers ?? []).join(', ')}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
