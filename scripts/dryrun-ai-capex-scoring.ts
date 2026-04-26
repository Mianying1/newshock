// Phase 2B.2 dry-run · score AI Capex theme via new pipeline.
// No DB writes. Output: /tmp/ai-capex-dryrun.json
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'node:fs'
import { fetchArchetypeBuckets, retrieveTickersByArchetype } from '@/lib/ticker-retrieval'
import { scoreTickersForTheme, stratifiedSample, type ThemeContext } from '@/lib/ticker-llm-scoring'

const THEME: ThemeContext = {
  name: 'AI Capex Cycle · Datacenter Buildout',
  archetype_name: 'AI Capex & Infrastructure Build-out',
  summary:
    'Multi-year AI infrastructure capex driven by hyperscaler and neocloud datacenter buildouts. Direct beneficiaries include GPU/accelerator suppliers, server/networking hardware, datacenter electrical and cooling infrastructure, and the contracted power supply for new datacenter capacity. Excludes hyperscaler equity itself (focuses on the supply chain).',
}

async function main() {
  console.log(`[retrieve] archetype=ai_capex_infrastructure`)
  const candidates = await retrieveTickersByArchetype('ai_capex_infrastructure', { limit: 200 })
  const archetypeBuckets = await fetchArchetypeBuckets('ai_capex_infrastructure', 0)
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
  console.log('[sample.debug] must_have per bucket (top 5 by retrieval_score):')
  for (const [b, ts] of Object.entries(sampled.debug.must_have_per_bucket ?? {})) {
    console.log(`  ${b.padEnd(28)} ${ts.join(', ')}`)
  }
  if (sampled.debug.trimmed_for_max_eval) console.log(`[sample.debug] trimmed ${sampled.debug.trimmed_for_max_eval} from tail/mid for max_eval`)
  console.log('[sample.debug] bucket coverage in top+mid:')
  for (const [b, n] of Object.entries(sampled.debug.bucket_coverage_in_pool ?? {})) {
    const tag = n < 3 ? '⚠' : ' '
    console.log(`  ${tag} ${b.padEnd(28)} ${n}`)
  }
  console.log(`[sample.debug] under-represented (count<3): ${(sampled.debug.buckets_underrepresented ?? []).join(', ') || '∅'}`)
  console.log('[sample.debug] tail tickers picked:')
  for (const t of sampled.tail) {
    const rank = candidates.findIndex(c => c.ticker === t.ticker) + 1
    console.log(`  + rank ${String(rank).padStart(3)}  ${t.ticker.padEnd(7)} matched=[${t.matched_buckets.join(',')}]  s=${t.retrieval_score}`)
  }
  // For each under-covered bucket, list top 5 tail-pool candidates so we see who beat whom
  console.log('[sample.debug] top 5 tail-pool candidates per under-covered bucket:')
  const tailPool = candidates.slice(100)
  for (const b of sampled.debug.buckets_underrepresented ?? []) {
    const matches = tailPool.filter(p => p.matched_buckets.includes(b)).slice(0, 5)
    console.log(`  ${b}:`)
    for (const m of matches) {
      const rank = candidates.findIndex(c => c.ticker === m.ticker) + 1
      console.log(`    rank ${String(rank).padStart(3)}  ${m.ticker.padEnd(7)} matched=[${m.matched_buckets.join(',')}]  s=${m.retrieval_score}  mcap=$${(m.market_cap / 1e9).toFixed(0)}B`)
    }
  }

  console.log(`[llm] scoring with Sonnet…`)
  const t0 = Date.now()
  const { scores, usage, cost_usd } = await scoreTickersForTheme(THEME, eval_set)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[llm] done in ${elapsed}s · in=${usage.in} out=${usage.out} cache_read=${usage.cache_read} cache_create=${usage.cache_create}`)
  console.log(`[llm] cost: $${cost_usd.toFixed(4)}`)
  console.log(`[llm] returned ${scores.length}/${eval_set.length} scores`)

  // Join score back to retrieval row
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

  // Tier distribution
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

  console.log('\n=== Power tickers — VST / CEG / NRG / NEE / SO ===')
  for (const t of ['VST', 'CEG', 'NRG', 'NEE', 'SO']) {
    const s = enriched.find(x => x.ticker.toUpperCase() === t)
    if (!s) {
      const inEval = eval_set.find(x => x.ticker.toUpperCase() === t)
      console.log(`  ${t}: ${inEval ? 'in eval set but missing from LLM output' : 'not sampled'}`)
    } else {
      console.log(`  ${t}: exposure=${s.exposure_pct}% T${s.tier} ${s.exposure_direction} · ${s.reasoning.slice(0, 90)}`)
    }
  }

  console.log('\n=== Mega-cap reality check (should be modest, not Tier 1) ===')
  for (const t of ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'GOOGL']) {
    const s = enriched.find(x => x.ticker.toUpperCase() === t)
    if (!s) { console.log(`  ${t}: not sampled`); continue }
    console.log(`  ${t}: exposure=${s.exposure_pct}% T${s.tier} ${s.exposure_direction} · ${s.reasoning.slice(0, 90)}`)
  }

  // Dual-class dedup check
  console.log('\n=== Dual-class dedup check ===')
  for (const pair of [['GOOG', 'GOOGL'], ['BRK.A', 'BRK-A', 'BRK.B', 'BRK-B']]) {
    const inEvalNames = pair.filter(t => eval_set.find(x => x.ticker.toUpperCase() === t.toUpperCase()))
    console.log(`  [${pair.join(',')}] in eval set: ${inEvalNames.length === 0 ? '∅' : inEvalNames.join(', ')}`)
  }

  // Detailed MSFT diagnostic — was it in retrieval? sampled? scored?
  console.log('\n=== MSFT diagnostic ===')
  const msftIdx = candidates.findIndex(c => c.ticker.toUpperCase() === 'MSFT')
  if (msftIdx === -1) {
    console.log('  retrieval: MSFT not in top 200 candidates')
  } else {
    const m = candidates[msftIdx]
    console.log(`  retrieval rank: ${msftIdx + 1} / ${candidates.length}`)
    console.log(`  retrieval_score: ${m.retrieval_score}`)
    console.log(`  industry_buckets: [${m.industry_buckets.join(',')}]`)
    console.log(`  matched_buckets:  [${m.matched_buckets.join(',')}]`)
    console.log(`  bucket_weight_sum: ${m.bucket_weight_sum}`)
    console.log(`  market_cap: $${(m.market_cap / 1e9).toFixed(0)}B`)
  }
  const inEval = eval_set.find(x => x.ticker.toUpperCase() === 'MSFT')
  console.log(`  in eval set:   ${inEval ? 'YES' : 'NO'}`)
  if (inEval) {
    const layer =
      sampled.must_have.includes(inEval) ? 'must_have' :
      sampled.top.includes(inEval) ? 'top' :
      sampled.mid.includes(inEval) ? 'mid' :
      sampled.tail.includes(inEval) ? 'tail' : 'unknown'
    console.log(`  sampled in:    ${layer}`)
  }
  const llmScored = scores.find(s => s.ticker.toUpperCase() === 'MSFT')
  console.log(`  LLM scored:    ${llmScored ? `YES · exposure=${llmScored.exposure_pct}% T${llmScored.tier}` : 'NO (LLM omitted from response)'}`)

  writeFileSync('/tmp/ai-capex-dryrun.json', JSON.stringify({
    theme: THEME,
    retrieval: { count: candidates.length, top: candidates.slice(0, 200).map(c => ({ ticker: c.ticker, retrieval_score: c.retrieval_score, matched_buckets: c.matched_buckets })) },
    sampling: { must_have: sampled.must_have.length, top: sampled.top.length, mid: sampled.mid.length, tail: sampled.tail.length, total: eval_set.length },
    llm: { usage, cost_usd, model: 'sonnet-4-5' },
    tier_distribution: tierDist,
    exposure_histogram: expBuckets,
    scores: enriched,
  }, null, 2))
  console.log('\nwritten: /tmp/ai-capex-dryrun.json')
}

main().catch(e => { console.error(e); process.exit(1) })
