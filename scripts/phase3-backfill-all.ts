// Phase 3 step 3 · full backfill across all active/cooling themes.
// Pipeline per theme: retrieval → stratified sample → Sonnet score → upsert.
// Writes ONLY: tier, exposure_pct, exposure_direction, reasoning, source,
// last_confirmed_at. Legacy columns untouched. Legacy rows not rescored kept.
//
// Run:
//   npx tsx --env-file=.env.local scripts/phase3-backfill-all.ts
//
// Skip-completed mode (default ON):
//   Themes whose theme_recommendations already have rows with
//   source='industry_retrieval' AND last_confirmed_at >= SKIP_SINCE are
//   skipped. Set --no-skip-completed to disable.
//
// Abort conditions:
//   - cumulative cost > $15
//   - >= MAX_FAILED_THEMES themes have failed (LLM retry exhausted)
//   - 5 consecutive themes return 0 T1
//   - any theme returns 0 retrieval candidates
//
// LLM retry: if scoreTickersForTheme rejects with "terminated" we sleep
// LLM_RETRY_SLEEP_MS and retry, up to LLM_MAX_ATTEMPTS total attempts.
// Between themes we sleep INTER_THEME_SLEEP_MS to ease API pressure.
//
// Progress every 10 themes. Final report at end.
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'node:fs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fetchArchetypeBuckets, retrieveTickersByArchetype } from '@/lib/ticker-retrieval'
import { scoreTickersForTheme, stratifiedSample, type ThemeContext } from '@/lib/ticker-llm-scoring'

const COST_BUDGET_USD = 15
const MAX_FAILED_THEMES = 10
const MAX_CONSECUTIVE_T1_ZERO = 5
const LLM_MAX_ATTEMPTS = 3
const LLM_RETRY_SLEEP_MS = 30_000
const INTER_THEME_SLEEP_MS = 5_000
const SKIP_SINCE = '2026-04-25T00:00:00Z'
const SKIP_COMPLETED = !process.argv.includes('--no-skip-completed')
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_PATH = `/tmp/phase3-backfill-${RUN_ID}.log`

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

interface ThemeRow {
  id: string
  name: string
  summary: string | null
  archetype_id: string | null
  status: string
  event_count: number | null
}

interface ThemeOutcome {
  theme_id: string
  theme_name: string
  archetype_id: string | null
  status: 'ok' | 'failed' | 'no_archetype' | 'no_buckets' | 'retrieval_zero'
  err?: string
  retrieved?: number
  evaluated?: number
  scored?: number
  inserted?: number
  updated?: number
  legacy_kept?: number
  dropped_low_pct?: number
  t1?: number
  t2?: number
  t3?: number
  cost_usd?: number
  elapsed_sec?: number
}

const log = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try { writeFileSync(LOG_PATH, line + '\n', { flag: 'a' }) } catch {}
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

async function processTheme(theme: ThemeRow): Promise<ThemeOutcome> {
  const t0 = Date.now()
  const out: ThemeOutcome = {
    theme_id: theme.id,
    theme_name: theme.name,
    archetype_id: theme.archetype_id,
    status: 'ok',
  }

  if (!theme.archetype_id) {
    out.status = 'no_archetype'
    return out
  }

  // 1. Retrieval
  const candidates = await retrieveTickersByArchetype(theme.archetype_id, { limit: 200 })
  out.retrieved = candidates.length
  const archetypeBuckets = await fetchArchetypeBuckets(theme.archetype_id, 0)
  if (candidates.length === 0) {
    out.status = 'retrieval_zero'
    return out
  }
  if (archetypeBuckets.length === 0) {
    out.status = 'no_buckets'
    return out
  }

  // 2. Sample
  const sampled = stratifiedSample(candidates, {
    top: 30, mid_to: 100, tail_strategy: 'bucket_aware',
    min_per_bucket: 3, per_bucket_add: 4, max_add: 35,
    dedupe_dual_class: true, archetype_buckets: archetypeBuckets,
    per_bucket_must_have: 5, bucket_weight_threshold: 0.5, max_eval: 150,
  })
  const evalSet = [...sampled.must_have, ...sampled.top, ...sampled.mid, ...sampled.tail]
  out.evaluated = evalSet.length

  // 3. Archetype rules + score
  const { data: arch } = await supabaseAdmin
    .from('theme_archetypes')
    .select('exclusion_rules, expected_sectors')
    .eq('id', theme.archetype_id)
    .maybeSingle()

  const themeCtx: ThemeContext = {
    name: theme.name,
    summary: theme.summary ?? '',
    archetype_name: theme.archetype_id,
    exclusion_rules: arch?.exclusion_rules ?? [],
    expected_sectors: arch?.expected_sectors ?? [],
  }

  let scoreRes
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
    try {
      scoreRes = await scoreTickersForTheme(themeCtx, evalSet)
      break
    } catch (e) {
      lastErr = e
      const msg = (e as Error).message
      log(`  [llm-fail attempt ${attempt}/${LLM_MAX_ATTEMPTS}] ${theme.name}: ${msg}`)
      if (attempt === LLM_MAX_ATTEMPTS) {
        out.status = 'failed'
        out.err = msg
        return out
      }
      log(`  [llm-retry] sleeping ${LLM_RETRY_SLEEP_MS / 1000}s before retry…`)
      await sleep(LLM_RETRY_SLEEP_MS)
    }
  }
  if (!scoreRes) {
    out.status = 'failed'
    out.err = String(lastErr)
    return out
  }
  const { scores, cost_usd } = scoreRes
  out.scored = scores.length
  out.cost_usd = cost_usd

  // 4. Diff vs existing + upsert
  const { data: existingData } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol')
    .eq('theme_id', theme.id)
  const existingSet = new Set((existingData ?? []).map((r: { ticker_symbol: string }) => r.ticker_symbol.toUpperCase()))

  // LLM-judged below the threshold means "not really exposed to this theme" —
  // drop instead of writing as a low-confidence row, since the theme detail
  // page filters by tier 1/2/3 (no UI for low-confidence). Threshold of 25
  // chosen empirically from sample (pct<15 are clearly off-topic, 15-24 are
  // weak excuses); see scripts/_backfill-reasoning-and-threshold.ts.
  const PCT_THRESHOLD = 25
  const kept = scores.filter(s => (s.exposure_pct ?? 0) >= PCT_THRESHOLD)
  const droppedLowPct = scores.length - kept.length

  const upsertRows = kept.map(s => {
    const pct = s.exposure_pct ?? 0
    const band = pct >= 75 ? 'high' : pct >= 50 ? 'medium' : 'medium'
    return {
      theme_id: theme.id,
      ticker_symbol: s.ticker.toUpperCase(),
      tier: s.tier,
      exposure_pct: pct,
      exposure_direction: s.exposure_direction,
      role_reasoning: s.reasoning,
      confidence_band: band,
      source: 'industry_retrieval' as const,
      last_confirmed_at: new Date().toISOString(),
    }
  })

  const inserts = upsertRows.filter(r => !existingSet.has(r.ticker_symbol))
  const updates = upsertRows.length - inserts.length
  out.inserted = inserts.length
  out.updated = updates
  out.legacy_kept = existingSet.size - updates
  out.dropped_low_pct = droppedLowPct
  out.t1 = kept.filter(s => s.tier === 1).length
  out.t2 = kept.filter(s => s.tier === 2).length
  out.t3 = kept.filter(s => s.tier === 3).length

  await ensureTickersExist(
    inserts.map(r => r.ticker_symbol),
    new Map(candidates.map(c => [c.ticker.toUpperCase(), { company_name: c.company_name }])),
  )

  const { error: upsertErr } = await supabaseAdmin
    .from('theme_recommendations')
    .upsert(upsertRows, { onConflict: 'theme_id,ticker_symbol' })
  if (upsertErr) {
    out.status = 'failed'
    out.err = `upsert: ${upsertErr.message}`
    return out
  }

  out.elapsed_sec = (Date.now() - t0) / 1000
  return out
}

const CORE_THEMES_BY_ARCHETYPE = [
  'middle_east_energy_shock',
  'ai_capex_infrastructure',
  'global_defense_spending_super_cycle',
  'pharma_innovation_super_cycle',
  'crypto_institutional_infrastructure',
]

async function coreThemesTop10Report() {
  const lines: string[] = []
  for (const archId of CORE_THEMES_BY_ARCHETYPE) {
    const { data: themes } = await supabaseAdmin
      .from('themes')
      .select('id, name, archetype_id, status, event_count')
      .eq('archetype_id', archId)
      .in('status', ['active', 'cooling'])
      .order('event_count', { ascending: false })
      .limit(1)
    const t = themes?.[0]
    lines.push(`\n--- ${archId} ---`)
    if (!t) {
      lines.push(`  (no active/cooling theme found)`)
      continue
    }
    lines.push(`  theme: ${t.name} (${t.id})`)
    const { data: rows } = await supabaseAdmin
      .from('theme_recommendations')
      .select('ticker_symbol, tier, exposure_pct, exposure_direction, source')
      .eq('theme_id', t.id)
      .order('exposure_pct', { ascending: false, nullsFirst: false })
      .limit(10)
    if (!rows || rows.length === 0) {
      lines.push(`  (no recommendations)`)
      continue
    }
    lines.push(`  rank ticker  pct  tier dir       src`)
    rows.forEach((r, i) => {
      lines.push(`  ${String(i + 1).padStart(4)} ${r.ticker_symbol.padEnd(7)} ${String(r.exposure_pct ?? '?').padStart(3)}% T${r.tier ?? '?'} ${(r.exposure_direction ?? '?').padEnd(9)} ${r.source ?? '?'}`)
    })
  }
  return lines.join('\n')
}

async function spotcheckReport() {
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .in('status', ['active', 'cooling'])
  if (!themes) return '(no themes)'
  const themeIds = themes.map(t => t.id)

  const counts = new Map<string, { name: string; total: number; t1: number; t2: number; t3: number }>()
  for (const t of themes) counts.set(t.id, { name: t.name, total: 0, t1: 0, t2: 0, t3: 0 })

  // Page through theme_recommendations
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('theme_recommendations')
      .select('theme_id, tier')
      .in('theme_id', themeIds)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`spotcheck: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data) {
      const c = counts.get(r.theme_id)
      if (!c) continue
      c.total++
      if (r.tier === 1) c.t1++
      else if (r.tier === 2) c.t2++
      else if (r.tier === 3) c.t3++
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  const arr = [...counts.values()].sort((a, b) => b.t1 - a.t1 || b.t2 - a.t2)
  const lines = [
    `theme_name                                              total  t1  t2  t3`,
    ...arr.map(c =>
      `${c.name.slice(0, 54).padEnd(54)} ${String(c.total).padStart(5)} ${String(c.t1).padStart(3)} ${String(c.t2).padStart(3)} ${String(c.t3).padStart(3)}`),
  ]
  return lines.join('\n')
}

async function main() {
  log(`[start] log=${LOG_PATH}`)
  const { data: themesRaw, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, archetype_id, status, event_count')
    .in('status', ['active', 'cooling'])
    .order('event_count', { ascending: false })
  if (error) throw new Error(`themes: ${error.message}`)
  const allThemes = (themesRaw ?? []) as ThemeRow[]
  log(`[scope] ${allThemes.length} themes (status active/cooling)`)

  // Build skip set from theme_recommendations completed since SKIP_SINCE
  let themes = allThemes
  if (SKIP_COMPLETED) {
    const allIds = allThemes.map(t => t.id)
    const completedIds = new Set<string>()
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error: e2 } = await supabaseAdmin
        .from('theme_recommendations')
        .select('theme_id, last_confirmed_at, source')
        .in('theme_id', allIds)
        .eq('source', 'industry_retrieval')
        .gte('last_confirmed_at', SKIP_SINCE)
        .range(from, from + PAGE - 1)
      if (e2) throw new Error(`skip-check: ${e2.message}`)
      if (!data || data.length === 0) break
      for (const r of data) completedIds.add(r.theme_id)
      if (data.length < PAGE) break
      from += PAGE
    }
    themes = allThemes.filter(t => !completedIds.has(t.id))
    log(`[skip] completed since ${SKIP_SINCE}: ${completedIds.size} themes · remaining: ${themes.length}`)
  } else {
    log(`[skip] disabled (--no-skip-completed) · running all ${themes.length}`)
  }

  const outcomes: ThemeOutcome[] = []
  let cumulCost = 0
  let consecutiveT1Zero = 0
  let failedThemes = 0
  let aborted: string | null = null

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i]
    const idx = i + 1
    const archStr = theme.archetype_id ?? '(none)'
    log(`\n[${idx}/${themes.length}] ${theme.name} · arch=${archStr} · status=${theme.status}`)

    let outcome: ThemeOutcome
    try {
      outcome = await processTheme(theme)
    } catch (e) {
      outcome = {
        theme_id: theme.id,
        theme_name: theme.name,
        archetype_id: theme.archetype_id,
        status: 'failed',
        err: (e as Error).message,
      }
    }
    outcomes.push(outcome)

    if (outcome.status === 'ok') {
      cumulCost += outcome.cost_usd ?? 0
      log(`  ✓ retrieved=${outcome.retrieved} eval=${outcome.evaluated} scored=${outcome.scored} ` +
          `(T1=${outcome.t1} T2=${outcome.t2} T3=${outcome.t3}) ins=${outcome.inserted} upd=${outcome.updated} ` +
          `legacy_kept=${outcome.legacy_kept} cost=$${(outcome.cost_usd ?? 0).toFixed(4)} ` +
          `(cumul=$${cumulCost.toFixed(4)}) elapsed=${outcome.elapsed_sec?.toFixed(1)}s`)
      if ((outcome.t1 ?? 0) === 0) consecutiveT1Zero++
      else consecutiveT1Zero = 0
    } else {
      log(`  ✗ status=${outcome.status} err=${outcome.err ?? '(none)'} retrieved=${outcome.retrieved ?? '?'}`)
      if (outcome.status === 'failed') failedThemes++
      if (outcome.status === 'retrieval_zero') {
        aborted = `retrieval=0 for theme ${theme.name} (archetype=${archStr})`
        break
      }
    }

    // Abort checks
    if (cumulCost > COST_BUDGET_USD) {
      aborted = `cost budget exceeded ($${cumulCost.toFixed(4)} > $${COST_BUDGET_USD})`
      break
    }
    if (failedThemes >= MAX_FAILED_THEMES) {
      aborted = `${failedThemes} themes failed (>= ${MAX_FAILED_THEMES})`
      break
    }
    if (consecutiveT1Zero >= MAX_CONSECUTIVE_T1_ZERO) {
      aborted = `${consecutiveT1Zero} consecutive themes returned 0 T1 (pipeline likely broken)`
      break
    }

    // Progress every 5
    if (idx % 5 === 0) {
      const ok = outcomes.filter(o => o.status === 'ok').length
      const fail = outcomes.filter(o => o.status === 'failed').length
      const failedNames = outcomes.filter(o => o.status === 'failed').map(o => o.theme_name)
      log(`\n[progress ${idx}/${themes.length}] ok=${ok} fail=${fail} cumul_cost=$${cumulCost.toFixed(4)}`)
      if (failedNames.length > 0) log(`  failed so far: ${failedNames.join(' · ')}`)
    }

    // Inter-theme sleep · ease API pressure
    if (idx < themes.length) await sleep(INTER_THEME_SLEEP_MS)
  }

  if (aborted) log(`\n[ABORT] ${aborted}`)

  // === FINAL REPORT ===
  log(`\n${'='.repeat(70)}`)
  log(`FINAL REPORT`)
  log(`${'='.repeat(70)}`)
  const ok = outcomes.filter(o => o.status === 'ok')
  const fail = outcomes.filter(o => o.status !== 'ok')
  const totalIns = ok.reduce((a, o) => a + (o.inserted ?? 0), 0)
  const totalUpd = ok.reduce((a, o) => a + (o.updated ?? 0), 0)
  const totalT1 = ok.reduce((a, o) => a + (o.t1 ?? 0), 0)
  const totalT2 = ok.reduce((a, o) => a + (o.t2 ?? 0), 0)
  const totalT3 = ok.reduce((a, o) => a + (o.t3 ?? 0), 0)
  log(`themes: total=${themes.length} processed=${outcomes.length} ok=${ok.length} fail/skip=${fail.length}`)
  log(`writes: INSERT=${totalIns} UPDATE=${totalUpd}`)
  log(`tiers (this run, sum across themes): T1=${totalT1} T2=${totalT2} T3=${totalT3}`)
  log(`cost: $${cumulCost.toFixed(4)} (budget $${COST_BUDGET_USD})`)

  // Anomalies
  const t1Zero = ok.filter(o => (o.t1 ?? 0) === 0)
  const lowRet = ok.filter(o => (o.retrieved ?? 0) < 30)
  log(`\n--- ANOMALIES ---`)
  log(`themes with T1=0 (${t1Zero.length}):`)
  for (const o of t1Zero) log(`  - ${o.theme_name} (arch=${o.archetype_id}) retrieved=${o.retrieved}`)
  log(`themes with retrieval<30 (${lowRet.length}):`)
  for (const o of lowRet) log(`  - ${o.theme_name} (arch=${o.archetype_id}) retrieved=${o.retrieved}`)
  log(`themes failed/skipped (${fail.length}):`)
  for (const o of fail) log(`  - ${o.theme_name} (arch=${o.archetype_id}) status=${o.status} err=${o.err ?? '-'}`)

  // Tier distribution from DB
  log(`\n--- TIER DISTRIBUTION (full DB · active+cooling themes) ---`)
  try {
    const spotcheck = await spotcheckReport()
    log(spotcheck)
  } catch (e) {
    log(`  (spotcheck failed: ${(e as Error).message})`)
  }

  // 5 core themes top 10
  log(`\n--- 5 CORE THEMES · TOP 10 ---`)
  try {
    const core = await coreThemesTop10Report()
    log(core)
  } catch (e) {
    log(`  (core report failed: ${(e as Error).message})`)
  }

  // Save outcomes JSON
  const summaryPath = `/tmp/phase3-backfill-${RUN_ID}-summary.json`
  writeFileSync(summaryPath, JSON.stringify({
    run_id: RUN_ID,
    aborted,
    cumul_cost_usd: cumulCost,
    total_themes: themes.length,
    processed: outcomes.length,
    ok: ok.length,
    failed: fail.length,
    inserts: totalIns,
    updates: totalUpd,
    outcomes,
  }, null, 2))
  log(`\n[done] log=${LOG_PATH} summary=${summaryPath}`)
}

main().catch(e => { log(`FATAL: ${(e as Error).message}\n${(e as Error).stack}`); process.exit(1) })
