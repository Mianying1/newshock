// Phase 3 step-2 · single-theme dry-run on Crypto Institutional Infrastructure.
// Same shape as the AI Capex / Iran dry-runs but for a medium-strength theme.
// No DB writes. Output: /tmp/crypto-inst-dryrun.json
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'node:fs'
import { fetchArchetypeBuckets, retrieveTickersByArchetype } from '@/lib/ticker-retrieval'
import { scoreTickersForTheme, stratifiedSample, type ThemeContext } from '@/lib/ticker-llm-scoring'

const THEME: ThemeContext = {
  name: 'Crypto Institutional Infrastructure',
  archetype_name: 'Crypto Institutional Infrastructure',
  summary:
    'Build-out of institutional-grade crypto infrastructure: spot ETFs (BTC/ETH and beyond), regulated custody, stablecoin payment rails, prime brokerage, and bank-integrated digital asset services. Direct beneficiaries: crypto exchanges/brokers with institutional flow (COIN, regulated stablecoin issuers, custody specialists), asset managers issuing crypto ETFs (BLK, FI), and bank/fintech players building digital asset rails. Excludes pure-play crypto miners (different theme: hashrate / mining capex).',
}

const SANITY_TICKERS = ['COIN', 'MSTR', 'BLK', 'CME', 'PYPL', 'HOOD', 'SQ', 'GS', 'JPM']

async function main() {
  console.log(`[retrieve] archetype=crypto_institutional_infrastructure`)
  const candidates = await retrieveTickersByArchetype('crypto_institutional_infrastructure', { limit: 200 })
  const archetypeBuckets = await fetchArchetypeBuckets('crypto_institutional_infrastructure', 0)
  console.log(`[retrieve] ${candidates.length} candidates · ${archetypeBuckets.length} buckets`)

  const sampled = stratifiedSample(candidates, {
    top: 30,
    mid_to: 100,
    tail_strategy: 'bucket_aware',
    min_per_bucket: 3,
    per_bucket_add: 4,
    max_add: 35,
    dedupe_dual_class: true,
    archetype_buckets: archetypeBuckets,
    per_bucket_must_have: 5,
    bucket_weight_threshold: 0.5,
    max_eval: 150,
  })
  const eval_set = [...sampled.must_have, ...sampled.top, ...sampled.mid, ...sampled.tail]
  console.log(`[sample] must=${sampled.must_have.length} top=${sampled.top.length} mid=${sampled.mid.length} tail=${sampled.tail.length} → eval=${eval_set.length}`)
  console.log('[sample.debug] must_have per bucket (top 5; primary→retrieval_score):')
  for (const [b, ts] of Object.entries(sampled.debug.must_have_per_bucket ?? {})) {
    console.log(`  ${b.padEnd(28)} ${ts.join(', ')}`)
  }
  console.log(`[sample.debug] under-represented (count<3): ${(sampled.debug.buckets_underrepresented ?? []).join(', ') || '∅'}`)
  if (sampled.debug.tail_added_per_bucket) {
    console.log('[sample.debug] tail rescue per bucket:')
    for (const [b, n] of Object.entries(sampled.debug.tail_added_per_bucket)) console.log(`  ${b.padEnd(28)} +${n}`)
  }
  if (sampled.debug.trimmed_for_max_eval) console.log(`[sample.debug] trimmed ${sampled.debug.trimmed_for_max_eval} from tail/mid for max_eval`)

  console.log(`\n=== SANITY retrieval check ===`)
  for (const t of SANITY_TICKERS) {
    const idx = candidates.findIndex(c => c.ticker.toUpperCase() === t)
    if (idx === -1) {
      console.log(`  ⚠ ${t.padEnd(6)} NOT in top ${candidates.length} retrieval`)
    } else {
      const c = candidates[idx]
      const inEval = eval_set.find(x => x.ticker.toUpperCase() === t) ? 'eval' : '   -'
      console.log(`  ✓ ${t.padEnd(6)} rank ${String(idx + 1).padStart(3)} s=${c.retrieval_score} matched=[${c.matched_buckets.join(',')}] ${inEval}`)
    }
  }

  console.log(`\n[llm] scoring with Sonnet…`)
  const t0 = Date.now()
  const { scores, usage, cost_usd } = await scoreTickersForTheme(THEME, eval_set)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[llm] done in ${elapsed}s · in=${usage.in} out=${usage.out} cache_read=${usage.cache_read} cache_create=${usage.cache_create}`)
  console.log(`[llm] cost: $${cost_usd.toFixed(4)}`)
  console.log(`[llm] returned ${scores.length}/${eval_set.length} scores`)

  const retrievalById = new Map(candidates.map(c => [c.ticker.toUpperCase(), c]))
  const enriched = scores
    .map(s => {
      const r = retrievalById.get(s.ticker.toUpperCase())
      return {
        ticker: s.ticker,
        company_name: r?.company_name ?? '?',
        market_cap: r?.market_cap ?? 0,
        retrieval_rank: candidates.findIndex(c => c.ticker.toUpperCase() === s.ticker.toUpperCase()) + 1,
        retrieval_score: r?.retrieval_score ?? 0,
        matched_buckets: r?.matched_buckets ?? [],
        ...s,
      }
    })
    .sort((a, b) => b.exposure_pct - a.exposure_pct)

  const tierDist = { 1: 0, 2: 0, 3: 0 }
  const expBuckets = { '90-100': 0, '70-89': 0, '50-69': 0, '30-49': 0, '1-29': 0, '0': 0 }
  for (const s of enriched) {
    tierDist[s.tier]++
    if (s.exposure_pct >= 90) expBuckets['90-100']++
    else if (s.exposure_pct >= 70) expBuckets['70-89']++
    else if (s.exposure_pct >= 50) expBuckets['50-69']++
    else if (s.exposure_pct >= 30) expBuckets['30-49']++
    else if (s.exposure_pct >= 1) expBuckets['1-29']++
    else expBuckets['0']++
  }

  console.log('\n=== Tier distribution ===')
  console.log(`  Tier 1 (≥70):  ${tierDist[1]}`)
  console.log(`  Tier 2 (30-69): ${tierDist[2]}`)
  console.log(`  Tier 3 (<30):  ${tierDist[3]}`)

  console.log('\n=== exposure_pct histogram ===')
  for (const [k, v] of Object.entries(expBuckets)) {
    console.log(`  ${k.padEnd(6)} ${'█'.repeat(v).padEnd(40)} ${v}`)
  }

  console.log('\n=== Top 15 by exposure_pct ===')
  for (const s of enriched.slice(0, 15)) {
    console.log(`  ${s.ticker.padEnd(7)} ${String(s.exposure_pct).padStart(3)}% T${s.tier} ${s.exposure_direction.padEnd(8)} (rank ${String(s.retrieval_rank).padStart(3)}) ${s.reasoning.slice(0, 80)}`)
  }

  console.log('\n=== SANITY LLM scoring ===')
  for (const t of SANITY_TICKERS) {
    const s = enriched.find(x => x.ticker.toUpperCase() === t)
    if (!s) {
      const inEval = eval_set.find(x => x.ticker.toUpperCase() === t)
      console.log(`  ${t.padEnd(6)} ${inEval ? 'in eval, missing from LLM output' : 'not sampled'}`)
    } else {
      console.log(`  ${t.padEnd(6)} ${String(s.exposure_pct).padStart(3)}% T${s.tier} ${s.exposure_direction.padEnd(8)} · ${s.reasoning.slice(0, 90)}`)
    }
  }

  // Dual-class check (BRK is plausible here; banks)
  console.log('\n=== Dual-class dedup check ===')
  for (const pair of [['GOOG', 'GOOGL'], ['BRK.A', 'BRK-A', 'BRK.B', 'BRK-B']]) {
    const inEvalNames = pair.filter(t => eval_set.find(x => x.ticker.toUpperCase() === t.toUpperCase()))
    console.log(`  [${pair.join(',')}] in eval set: ${inEvalNames.length === 0 ? '∅' : inEvalNames.join(', ')}`)
  }

  // Bottom-of-list sanity — anything in T1/T2 that looks WTF?
  console.log('\n=== Top 5 surprising T1 (rank > 50) ===')
  const surprises = enriched.filter(s => s.tier === 1 && s.retrieval_rank > 50).slice(0, 5)
  for (const s of surprises) {
    console.log(`  ${s.ticker.padEnd(7)} ${s.exposure_pct}% (rank ${s.retrieval_rank}) · ${s.reasoning.slice(0, 90)}`)
  }

  writeFileSync('/tmp/crypto-inst-dryrun.json', JSON.stringify({
    theme: THEME,
    retrieval: { count: candidates.length, top: candidates.slice(0, 200).map(c => ({ ticker: c.ticker, retrieval_score: c.retrieval_score, matched_buckets: c.matched_buckets })) },
    sampling: { must_have: sampled.must_have.length, top: sampled.top.length, mid: sampled.mid.length, tail: sampled.tail.length, total: eval_set.length },
    llm: { usage, cost_usd, model: 'sonnet-4-5' },
    tier_distribution: tierDist,
    exposure_histogram: expBuckets,
    scores: enriched,
  }, null, 2))
  console.log('\nwritten: /tmp/crypto-inst-dryrun.json')
}

main().catch(e => { console.error(e); process.exit(1) })
