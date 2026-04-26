// Phase 3 step 3 · single-theme smoke test on Crypto Institutional Infrastructure.
// Two-stage:
//   tsx --env-file=.env.local scripts/phase3-smoke-test-crypto.ts            (preflight, no DB writes)
//   tsx --env-file=.env.local scripts/phase3-smoke-test-crypto.ts --apply    (upsert + verify)
//
// Writes ONLY: tier, exposure_pct, exposure_direction, reasoning, source, last_confirmed_at.
// Does NOT touch role_reasoning, business_exposure, catalyst, risk, evidence_event_ids, etc.
// Does NOT delete legacy rows whose ticker the new pipeline didn't recall.
import { config } from 'dotenv'
config({ path: '.env.local' })
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fetchArchetypeBuckets, retrieveTickersByArchetype } from '@/lib/ticker-retrieval'
import { scoreTickersForTheme, stratifiedSample, type ThemeContext } from '@/lib/ticker-llm-scoring'

const ARCHETYPE_ID = 'crypto_institutional_infrastructure'
const APPLY = process.argv.includes('--apply')

const THEME_CONTEXT_FALLBACK: Pick<ThemeContext, 'summary'> = {
  summary:
    'Build-out of institutional-grade crypto infrastructure: spot ETFs (BTC/ETH and beyond), regulated custody, stablecoin payment rails, prime brokerage, and bank-integrated digital asset services. Direct beneficiaries: crypto exchanges/brokers with institutional flow (COIN, regulated stablecoin issuers, custody specialists), asset managers issuing crypto ETFs (BLK, FI), and bank/fintech players building digital asset rails. Excludes pure-play crypto miners (different theme: hashrate / mining capex).',
}

interface ExistingRow {
  ticker_symbol: string
  tier: number | null
  exposure_pct: number | null
  exposure_direction: string | null
  reasoning: string | null
  source: string | null
  role_reasoning: string | null
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
    .select('ticker_symbol, tier, exposure_pct, exposure_direction, reasoning, source, role_reasoning')
    .eq('theme_id', themeId)
  if (error) throw new Error(`existing rows: ${error.message}`)
  return (data ?? []) as ExistingRow[]
}

async function ensureTickersExist(symbols: string[], byTicker: Map<string, { company_name: string }>) {
  if (symbols.length === 0) return { inserted: 0 }
  const { data: existing } = await supabaseAdmin
    .from('tickers')
    .select('symbol')
    .in('symbol', symbols)
  const have = new Set((existing ?? []).map((r: { symbol: string }) => r.symbol))
  const missing = symbols.filter(s => !have.has(s))
  if (missing.length === 0) return { inserted: 0 }
  const rows = missing.map(symbol => ({
    symbol,
    company_name: byTicker.get(symbol)?.company_name ?? symbol,
  }))
  const { error } = await supabaseAdmin.from('tickers').insert(rows)
  if (error) throw new Error(`tickers insert: ${error.message}`)
  return { inserted: rows.length, missing }
}

async function main() {
  const theme = await pickTheme()
  console.log(`[theme] id=${theme.id} name="${theme.name}" status=${theme.status} archetype=${theme.archetype_id}`)
  console.log(`[mode]  ${APPLY ? 'APPLY (will write)' : 'PREFLIGHT (no DB writes)'}`)

  // 1. Retrieval
  console.log(`\n[retrieve] archetype=${ARCHETYPE_ID}`)
  const candidates = await retrieveTickersByArchetype(ARCHETYPE_ID, { limit: 200 })
  const archetypeBuckets = await fetchArchetypeBuckets(ARCHETYPE_ID, 0)
  console.log(`[retrieve] ${candidates.length} candidates · ${archetypeBuckets.length} buckets`)
  if (candidates.length === 0) throw new Error('retrieval=0 — abort')

  // 2. Sample
  const sampled = stratifiedSample(candidates, {
    top: 30, mid_to: 100, tail_strategy: 'bucket_aware',
    min_per_bucket: 3, per_bucket_add: 4, max_add: 35,
    dedupe_dual_class: true, archetype_buckets: archetypeBuckets,
    per_bucket_must_have: 5, bucket_weight_threshold: 0.5, max_eval: 150,
  })
  const evalSet = [...sampled.must_have, ...sampled.top, ...sampled.mid, ...sampled.tail]
  console.log(`[sample] must=${sampled.must_have.length} top=${sampled.top.length} mid=${sampled.mid.length} tail=${sampled.tail.length} → eval=${evalSet.length}`)

  // 3. LLM score
  const { data: arch } = await supabaseAdmin
    .from('theme_archetypes')
    .select('exclusion_rules, expected_sectors')
    .eq('id', ARCHETYPE_ID)
    .maybeSingle()
  console.log(`[arch] exclusion_rules=${(arch?.exclusion_rules ?? []).length} expected_sectors=${JSON.stringify(arch?.expected_sectors ?? [])}`)
  const themeCtx: ThemeContext = {
    name: theme.name,
    summary: theme.summary ?? THEME_CONTEXT_FALLBACK.summary,
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
  console.log(`\n[diff] existing rows for theme: ${existing.length}`)
  const existingByTicker = new Map(existing.map(r => [r.ticker_symbol.toUpperCase(), r]))
  const candidateByTicker = new Map(candidates.map(c => [c.ticker.toUpperCase(), c]))
  const scoredByTicker = new Map(scores.map(s => [s.ticker.toUpperCase(), s]))

  const upsertRows = scores.map(s => {
    const sym = s.ticker.toUpperCase()
    return {
      theme_id: theme.id,
      ticker_symbol: sym,
      tier: s.tier,
      exposure_pct: s.exposure_pct,
      exposure_direction: s.exposure_direction,
      reasoning: s.reasoning,
      source: 'industry_retrieval' as const,
      last_confirmed_at: new Date().toISOString(),
    }
  })

  const newInserts = upsertRows.filter(r => !existingByTicker.has(r.ticker_symbol))
  const updates = upsertRows.filter(r => existingByTicker.has(r.ticker_symbol))
  const untouchedLegacy = existing.filter(r => !scoredByTicker.has(r.ticker_symbol.toUpperCase()))

  console.log(`\n=== UPSERT PLAN ===`)
  console.log(`  rows to write:    ${upsertRows.length}`)
  console.log(`    UPDATE (exists): ${updates.length}`)
  console.log(`    INSERT (new):    ${newInserts.length}`)
  console.log(`  legacy untouched: ${untouchedLegacy.length}  (in DB but not scored — kept as-is)`)
  console.log(`  fields written:   tier, exposure_pct, exposure_direction, reasoning, source, last_confirmed_at`)
  console.log(`  fields untouched: role_reasoning, business_exposure, catalyst, risk, evidence_event_ids, ...`)

  // Sample diffs
  console.log(`\n=== SAMPLE DIFF · 1 UPDATE ===`)
  const sampleUpdate = updates[0]
  if (sampleUpdate) {
    const before = existingByTicker.get(sampleUpdate.ticker_symbol)!
    console.log(`  ticker: ${sampleUpdate.ticker_symbol}`)
    console.log(`    tier:               ${before.tier} → ${sampleUpdate.tier}`)
    console.log(`    exposure_pct:       ${before.exposure_pct ?? 'null'} → ${sampleUpdate.exposure_pct}`)
    console.log(`    exposure_direction: ${before.exposure_direction ?? 'null'} → ${sampleUpdate.exposure_direction}`)
    console.log(`    reasoning:          ${(before.reasoning ?? 'null').slice(0, 60)}... → ${sampleUpdate.reasoning.slice(0, 60)}...`)
    console.log(`    source:             ${before.source ?? 'null'} → ${sampleUpdate.source}`)
    console.log(`    role_reasoning:     ${(before.role_reasoning ?? 'null').slice(0, 60)}... (UNCHANGED)`)
  } else {
    console.log(`  (no updates — all rows are inserts)`)
  }

  console.log(`\n=== SAMPLE DIFF · 1 INSERT ===`)
  const sampleInsert = newInserts[0]
  if (sampleInsert) {
    const cand = candidateByTicker.get(sampleInsert.ticker_symbol)
    console.log(`  ticker: ${sampleInsert.ticker_symbol}  (${cand?.company_name ?? '?'})`)
    console.log(`    tier:               ${sampleInsert.tier}`)
    console.log(`    exposure_pct:       ${sampleInsert.exposure_pct}`)
    console.log(`    exposure_direction: ${sampleInsert.exposure_direction}`)
    console.log(`    reasoning:          ${sampleInsert.reasoning.slice(0, 100)}...`)
    console.log(`    source:             ${sampleInsert.source}`)
  } else {
    console.log(`  (no inserts — all rows already exist)`)
  }

  console.log(`\n=== TOP 10 BY exposure_pct (about to write) ===`)
  const sorted = [...upsertRows].sort((a, b) => b.exposure_pct - a.exposure_pct)
  for (const r of sorted.slice(0, 10)) {
    const action = existingByTicker.has(r.ticker_symbol) ? 'UPDATE' : 'INSERT'
    console.log(`  ${r.ticker_symbol.padEnd(7)} ${String(r.exposure_pct).padStart(3)}% T${r.tier} ${r.exposure_direction.padEnd(8)} [${action}]`)
  }

  console.log(`\n=== LEGACY TICKERS NOT RESCORED (kept as-is) ===`)
  for (const r of untouchedLegacy.slice(0, 10)) {
    console.log(`  ${r.ticker_symbol.padEnd(7)} (existing tier=${r.tier} exposure_pct=${r.exposure_pct ?? 'null'})`)
  }
  if (untouchedLegacy.length > 10) console.log(`  ... +${untouchedLegacy.length - 10} more`)

  if (!APPLY) {
    console.log(`\n[preflight] DONE. Re-run with --apply to upsert.`)
    return
  }

  // === APPLY ===
  console.log(`\n[apply] ensuring ticker rows exist for ${newInserts.length} new tickers…`)
  const ensure = await ensureTickersExist(
    newInserts.map(r => r.ticker_symbol),
    new Map(candidates.map(c => [c.ticker.toUpperCase(), { company_name: c.company_name }])),
  )
  console.log(`[apply] inserted ${ensure.inserted} new tickers into tickers table`)

  console.log(`[apply] upserting ${upsertRows.length} rows into theme_recommendations…`)
  const { error: upsertErr } = await supabaseAdmin
    .from('theme_recommendations')
    .upsert(upsertRows, { onConflict: 'theme_id,ticker_symbol' })
  if (upsertErr) throw new Error(`upsert: ${upsertErr.message}`)

  console.log(`[apply] verifying — re-reading 5 sample rows…`)
  const sampleTickers = sorted.slice(0, 5).map(r => r.ticker_symbol)
  const { data: verify } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol, tier, exposure_pct, exposure_direction, reasoning, source, role_reasoning, business_exposure, catalyst, last_confirmed_at')
    .eq('theme_id', theme.id)
    .in('ticker_symbol', sampleTickers)
  console.log(`\n=== POST-APPLY VERIFY ===`)
  for (const v of (verify ?? [])) {
    console.log(`  ${v.ticker_symbol.padEnd(7)} T${v.tier} ${String(v.exposure_pct).padStart(3)}% ${v.exposure_direction} src=${v.source}`)
    console.log(`    reasoning:        ${(v.reasoning ?? '').slice(0, 100)}`)
    console.log(`    role_reasoning:   ${(v.role_reasoning ?? 'null').slice(0, 60)} (legacy)`)
    console.log(`    business_exposure: ${(v.business_exposure ?? 'null').slice(0, 60)} (legacy)`)
  }

  const { count: postCount } = await supabaseAdmin
    .from('theme_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('theme_id', theme.id)
  console.log(`\n[apply] DONE.`)
  console.log(`  before: ${existing.length} rows · after: ${postCount ?? '?'} rows`)
  console.log(`  inserts: ${newInserts.length} · updates: ${updates.length} · legacy untouched: ${untouchedLegacy.length}`)
  console.log(`  cost: $${cost_usd.toFixed(4)}`)
  console.log(`\n  inspect: dev URL → /themes/${theme.id}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
