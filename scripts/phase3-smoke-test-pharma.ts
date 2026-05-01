// Phase 3 step 1.B · single-theme smoke test on Pharma Innovation Super-Cycle.
// Verifies that the description anchor clarification (migration 15) lifts
// LLY/JNJ/ABBV/MRK/PFE/REGN into top 10 without flushing the small-cap biotechs.
//
// Two-stage:
//   tsx --env-file=.env.local scripts/phase3-smoke-test-pharma.ts            (preflight, no DB writes)
//   tsx --env-file=.env.local scripts/phase3-smoke-test-pharma.ts --apply    (upsert + verify)
//
// Writes ONLY: tier, exposure_pct, exposure_direction, reasoning, source, last_confirmed_at.
import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fetchArchetypeBuckets, retrieveTickersByArchetype } from '@/lib/ticker-retrieval'
import { scoreTickersForTheme, stratifiedSample, type ThemeContext } from '@/lib/ticker-llm-scoring'

const ARCHETYPE_ID = 'pharma_innovation_super_cycle'
const APPLY = process.argv.includes('--apply')

const MEGA_CAPS = ['LLY', 'JNJ', 'ABBV', 'MRK', 'PFE', 'REGN', 'NVO']
const SMALL_CAP_RETAIN = ['SMMT', 'ACLX', 'ALNY', 'KRYS', 'IONS', 'BBIO', 'VRTX']
const ANCHOR_KEYWORDS = ['anchor', 'mega-cap', 'mega cap', 'sustained R&D', 'super-cycle anchor', 'incumbent']

interface ExistingRow {
  ticker_symbol: string
  tier: number | null
  exposure_pct: number | null
  exposure_direction: string | null
  reasoning: string | null
  source: string | null
}

async function pickTheme() {
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, archetype_id, status, event_count')
    .eq('archetype_id', ARCHETYPE_ID)
    .in('status', ['active', 'cooling'])
    .order('event_count', { ascending: false })
  if (error) throw new Error(`themes lookup: ${error.message}`)
  if (!data || data.length === 0) throw new Error(`No active/cooling theme with archetype_id=${ARCHETYPE_ID}`)
  if (data.length > 1) {
    console.log(`[pick] ${data.length} themes match — picking highest event_count:`)
    for (const t of data) console.log(`  - ${t.id} · ${t.name} · ${t.status} · events=${t.event_count}`)
  }
  return data[0] as { id: string; name: string; summary: string | null; archetype_id: string; status: string; event_count: number }
}

async function fetchExisting(themeId: string): Promise<ExistingRow[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol, tier, exposure_pct, exposure_direction, reasoning, source')
    .eq('theme_id', themeId)
  if (error) throw new Error(`existing rows: ${error.message}`)
  return (data ?? []) as ExistingRow[]
}

async function ensureTickersExist(symbols: string[], byTicker: Map<string, { company_name: string }>) {
  if (symbols.length === 0) return 0
  const { data: existing } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .in('symbol', symbols)
  const have = new Set((existing ?? []).map((r: { symbol: string }) => r.symbol))
  const missing = symbols.filter(s => !have.has(s))
  if (missing.length === 0) return 0
  const rows = missing.map(symbol => ({
    symbol,
    company_name: byTicker.get(symbol)?.company_name ?? symbol,
  }))
  const { error } = await supabaseAdmin.from('tickers').insert(rows)
  if (error) throw new Error(`tickers insert: ${error.message}`)
  return rows.length
}

async function main() {
  const theme = await pickTheme()
  console.log(`[theme] id=${theme.id} name="${theme.name}" status=${theme.status} archetype=${theme.archetype_id}`)
  console.log(`[mode]  ${APPLY ? 'APPLY (will write)' : 'PREFLIGHT (no DB writes)'}`)

  // 1. Retrieval
  const candidates = await retrieveTickersByArchetype(ARCHETYPE_ID, { limit: 200 })
  const archetypeBuckets = await fetchArchetypeBuckets(ARCHETYPE_ID, 0)
  console.log(`[retrieve] ${candidates.length} candidates · ${archetypeBuckets.length} buckets`)
  if (candidates.length === 0) throw new Error('retrieval=0')

  // 2. Sample
  const sampled = stratifiedSample(candidates, {
    top: 30, mid_to: 100, tail_strategy: 'bucket_aware',
    min_per_bucket: 3, per_bucket_add: 4, max_add: 35,
    dedupe_dual_class: true, archetype_buckets: archetypeBuckets,
    per_bucket_must_have: 5, bucket_weight_threshold: 0.5, max_eval: 150,
  })
  const evalSet = [...sampled.must_have, ...sampled.top, ...sampled.mid, ...sampled.tail]
  console.log(`[sample] must=${sampled.must_have.length} top=${sampled.top.length} mid=${sampled.mid.length} tail=${sampled.tail.length} → eval=${evalSet.length}`)

  // 3. Archetype + LLM
  const { data: arch } = await supabaseAdmin
    .from('theme_archetypes')
    .select('description, exclusion_rules, expected_sectors')
    .eq('id', ARCHETYPE_ID)
    .maybeSingle()
  console.log(`[arch] description ends with: "...${(arch?.description ?? '').slice(-120)}"`)
  console.log(`[arch] exclusion_rules=${(arch?.exclusion_rules ?? []).length} expected_sectors=${(arch?.expected_sectors ?? []).length}`)

  const themeCtx: ThemeContext = {
    name: theme.name,
    summary: theme.summary ?? arch?.description ?? '',
    archetype_name: ARCHETYPE_ID,
    exclusion_rules: arch?.exclusion_rules ?? [],
    expected_sectors: arch?.expected_sectors ?? [],
  }

  console.log(`\n[llm] scoring ${evalSet.length} tickers with Sonnet…`)
  const t0 = Date.now()
  const { scores, usage, cost_usd } = await scoreTickersForTheme(themeCtx, evalSet)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[llm] ${elapsed}s · in=${usage.in} out=${usage.out} · $${cost_usd.toFixed(4)} · returned ${scores.length}/${evalSet.length}`)

  // 4. Diff vs existing
  const existing = await fetchExisting(theme.id)
  const existingByTicker = new Map(existing.map(r => [r.ticker_symbol.toUpperCase(), r]))
  const candidateByTicker = new Map(candidates.map(c => [c.ticker.toUpperCase(), c]))
  const scoredByTicker = new Map(scores.map(s => [s.ticker.toUpperCase(), s]))

  const PCT_THRESHOLD = 25
  const kept = scores.filter(s => (s.exposure_pct ?? 0) >= PCT_THRESHOLD)
  const upsertRows = kept.map(s => {
    const pct = s.exposure_pct ?? 0
    return {
      theme_id: theme.id,
      ticker_symbol: s.ticker.toUpperCase(),
      tier: s.tier,
      exposure_pct: pct,
      exposure_direction: s.exposure_direction,
      role_reasoning: s.reasoning,
      confidence_band: pct >= 75 ? 'high' : 'medium',
      source: 'industry_retrieval' as const,
      last_confirmed_at: new Date().toISOString(),
    }
  })

  const inserts = upsertRows.filter(r => !existingByTicker.has(r.ticker_symbol))
  const updates = upsertRows.length - inserts.length
  const untouchedLegacy = existing.filter(r => !scoredByTicker.has(r.ticker_symbol.toUpperCase()))

  console.log(`\n=== UPSERT PLAN ===`)
  console.log(`  rows to write: ${upsertRows.length} (UPDATE=${updates} INSERT=${inserts.length})`)
  console.log(`  legacy untouched: ${untouchedLegacy.length}`)

  // ─── TOP 10 ───
  const sorted = [...upsertRows].sort((a, b) => b.exposure_pct - a.exposure_pct)
  console.log(`\n=== TOP 10 BY exposure_pct ===`)
  for (let i = 0; i < Math.min(10, sorted.length); i++) {
    const r = sorted[i]
    const isMega = MEGA_CAPS.includes(r.ticker_symbol)
    const tag = isMega ? ' ★MEGA' : ''
    console.log(`  ${String(i + 1).padStart(2)} ${r.ticker_symbol.padEnd(7)} ${String(r.exposure_pct).padStart(3)}% T${r.tier} ${r.exposure_direction.padEnd(8)}${tag}`)
  }

  // ─── MEGA CAP STATUS (full ranking) ───
  console.log(`\n=== MEGA CAP RANKING (target: ≥3 in top 10) ===`)
  const megaRanks = MEGA_CAPS.map(t => {
    const idx = sorted.findIndex(r => r.ticker_symbol === t)
    if (idx === -1) {
      const cand = candidateByTicker.get(t)
      const inEval = evalSet.find(e => e.ticker.toUpperCase() === t)
      return { ticker: t, rank: '—', tier: '—', pct: '—', note: cand ? (inEval ? 'eval but not scored' : 'retrieved but not in eval set') : 'not in retrieval' }
    }
    const r = sorted[idx]
    return { ticker: t, rank: String(idx + 1), tier: `T${r.tier}`, pct: `${r.exposure_pct}%`, note: '' }
  })
  for (const m of megaRanks) {
    console.log(`  ${m.ticker.padEnd(5)} rank=${m.rank.padStart(3)} ${m.tier.padEnd(3)} ${m.pct.padEnd(5)} ${m.note}`)
  }
  const megaInTop10 = megaRanks.filter(m => m.rank !== '—' && Number(m.rank) <= 10).length
  console.log(`  → mega caps in top 10: ${megaInTop10} / ${MEGA_CAPS.length}  ${megaInTop10 >= 3 ? '✅ PASS' : '❌ FAIL'}`)

  // ─── SMALL CAP RETENTION ───
  console.log(`\n=== SMALL-CAP BIOTECH RETENTION (target: ≥2 in top 15) ===`)
  const smallRanks = SMALL_CAP_RETAIN.map(t => {
    const idx = sorted.findIndex(r => r.ticker_symbol === t)
    return { ticker: t, rank: idx === -1 ? '—' : String(idx + 1) }
  })
  for (const s of smallRanks) console.log(`  ${s.ticker.padEnd(5)} rank=${s.rank}`)
  const smallInTop15 = smallRanks.filter(s => s.rank !== '—' && Number(s.rank) <= 15).length
  console.log(`  → small caps in top 15: ${smallInTop15} / ${SMALL_CAP_RETAIN.length}  ${smallInTop15 >= 2 ? '✅ PASS' : '❌ FAIL'}`)

  // ─── REASONING SAMPLE FOR MEGA CAPS ───
  console.log(`\n=== MEGA CAP REASONING (look for: ${ANCHOR_KEYWORDS.join(' / ')}) ===`)
  let anchorMentions = 0
  for (const m of MEGA_CAPS) {
    const r = upsertRows.find(x => x.ticker_symbol === m)
    if (!r) {
      console.log(`  ${m.padEnd(5)} (not scored)`)
      continue
    }
    const reasoning = r.reasoning ?? ''
    const matched = ANCHOR_KEYWORDS.filter(k => reasoning.toLowerCase().includes(k.toLowerCase()))
    if (matched.length > 0) anchorMentions++
    console.log(`  ${m.padEnd(5)} T${r.tier} ${r.exposure_pct}%  matched_keywords=[${matched.join(',')}]`)
    console.log(`    "${reasoning.slice(0, 220)}${reasoning.length > 220 ? '…' : ''}"`)
  }
  console.log(`  → ${anchorMentions} / ${MEGA_CAPS.length} mega caps mention anchor-style language`)

  // ─── PASS/FAIL SUMMARY ───
  console.log(`\n=== PASS / FAIL ===`)
  console.log(`  mega caps in top 10 ≥3:  ${megaInTop10 >= 3 ? '✅' : '❌'} (${megaInTop10})`)
  console.log(`  small caps in top 15 ≥2: ${smallInTop15 >= 2 ? '✅' : '❌'} (${smallInTop15})`)
  console.log(`  anchor language present: ${anchorMentions > 0 ? '✅' : '❌'} (${anchorMentions})`)
  console.log(`  cost < $0.20:            ${cost_usd < 0.2 ? '✅' : '❌'} ($${cost_usd.toFixed(4)})`)

  if (!APPLY) {
    console.log(`\n[preflight] DONE. Re-run with --apply if pass.`)
    return
  }

  // === APPLY ===
  console.log(`\n[apply] ensuring ticker rows exist for ${inserts.length} new tickers…`)
  const insertedTickers = await ensureTickersExist(
    inserts.map(r => r.ticker_symbol),
    new Map(candidates.map(c => [c.ticker.toUpperCase(), { company_name: c.company_name }])),
  )
  console.log(`[apply] inserted ${insertedTickers} new tickers`)

  console.log(`[apply] upserting ${upsertRows.length} rows into theme_recommendations…`)
  const { error: upsertErr } = await supabaseAdmin
    .from('theme_recommendations')
    .upsert(upsertRows, { onConflict: 'theme_id,ticker_symbol' })
  if (upsertErr) throw new Error(`upsert: ${upsertErr.message}`)

  const { count: postCount } = await supabaseAdmin
    .from('theme_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('theme_id', theme.id)
  console.log(`\n[apply] DONE.`)
  console.log(`  before: ${existing.length} rows · after: ${postCount ?? '?'} rows`)
  console.log(`  inserts=${inserts.length} updates=${updates} legacy_kept=${untouchedLegacy.length}`)
  console.log(`  cost: $${cost_usd.toFixed(4)}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
