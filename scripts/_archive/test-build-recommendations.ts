import { config } from 'dotenv'
config({ path: '.env.local' })

import { buildThemeRadar } from '@/lib/recommendation-builder'

async function main() {
  // ── Mode 1: default (active, high-confidence) ─────────────────────────────
  console.log('═══════════════════════════════════════')
  console.log('  Mode 1: Active high-confidence themes')
  console.log('═══════════════════════════════════════')
  const mode1 = await buildThemeRadar({ include_exploratory: false })
  console.log(`\nSummary:`, JSON.stringify(mode1.summary, null, 2))
  console.log(`\nThemes (${mode1.themes.length}):`)
  for (const t of mode1.themes) {
    const tier1 = t.recommendations.filter((r) => r.tier === 1).map((r) => r.ticker_symbol)
    const latestCatalyst = t.catalysts[0]?.headline ?? '(none)'
    console.log(`\n  [${t.status}] ${t.name}`)
    console.log(`    archetype: ${t.archetype_id ?? 'exploratory'} | awareness: ${t.institutional_awareness} | strength: ${t.theme_strength_score} | conf: ${t.classification_confidence}`)
    console.log(`    recs: ${t.recommendations.length} | tier1: [${tier1.join(', ')}]`)
    console.log(`    catalysts: ${t.catalysts.length} | latest: "${latestCatalyst.slice(0, 70)}"`)
    console.log(`    summary: "${t.summary.slice(0, 100)}"`)
  }

  // ── Mode 2: explore (include exploratory) ─────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log('  Mode 2: Explore (active + exploratory)')
  console.log('═══════════════════════════════════════')
  const mode2 = await buildThemeRadar({ include_exploratory: true })
  console.log(`\nSummary:`, JSON.stringify(mode2.summary, null, 2))
  console.log(`\nAll ${mode2.themes.length} themes:`)
  for (const t of mode2.themes) {
    const tier1 = t.recommendations.filter((r) => r.tier === 1).map((r) => r.ticker_symbol)
    console.log(`  [${t.is_exploratory ? 'exploratory' : 'active'}] ${t.name} | conf=${t.classification_confidence} | recs=${t.recommendations.length} | T1=[${tier1.join(',')}]`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
