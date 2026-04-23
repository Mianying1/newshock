/* eslint-disable no-console */
/**
 * Rollout · Refine Recommendations (Phase 1 收敛化)
 *
 *   tsx --env-file=.env.local scripts/rollout-refine-recommendations.ts --limit 3
 *   tsx --env-file=.env.local scripts/rollout-refine-recommendations.ts               # full
 *   tsx --env-file=.env.local scripts/rollout-refine-recommendations.ts --dry         # no DB writes
 *
 * Concurrency = 3. Streams Sonnet per theme. Writes DB (delete + update).
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  callRefine,
  loadRefineInput,
  applyRefinement,
  type RefineInput,
  type RefineOutput,
  type RefineStats,
  type CurrentRec,
} from '@/lib/refine-recommendations'

function parseArgs(): { limit: number | null; only: string[] | null; dry: boolean; concurrency: number } {
  const args = process.argv.slice(2)
  let limit: number | null = null
  let only: string[] | null = null
  let dry = false
  let concurrency = 3
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--limit') {
      limit = parseInt(args[++i] ?? '0', 10)
      if (!Number.isFinite(limit) || limit! <= 0) limit = null
    } else if (a === '--only') {
      only = (args[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    } else if (a === '--dry') {
      dry = true
    } else if (a === '--concurrency') {
      const n = parseInt(args[++i] ?? '0', 10)
      if (Number.isFinite(n) && n > 0) concurrency = n
    }
  }
  return { limit, only, dry, concurrency }
}

async function fetchThemes(limit: number | null, only: string[] | null) {
  let q = supabaseAdmin
    .from('themes')
    .select('id, name, event_count, status')
    .in('status', ['active', 'exploratory_candidate'])
    .order('event_count', { ascending: false })
  if (only && only.length > 0) q = q.in('id', only)
  if (limit) q = q.limit(limit)
  const { data, error } = await q
  if (error) throw new Error(`fetch themes: ${error.message}`)
  return (data ?? []) as { id: string; name: string; event_count: number }[]
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function spawn() {
    while (true) {
      const idx = next++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx], idx)
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => spawn()))
  return results
}

interface ThemeResult {
  ok: boolean
  theme_id: string
  theme_name: string
  before_count: number
  after_count: number
  direct: number
  observational: number
  pressure: number
  conf_high: number
  conf_medium: number
  conf_low: number
  explicit_removed: number
  implicit_removed: number
  implicit_removed_tickers: string[]
  removed_tickers: string[]
  summary: string
  stats: RefineStats | null
  error: string | null
  input?: RefineInput
  output?: RefineOutput
}

function countByType(output: RefineOutput): { direct: number; observational: number; pressure: number } {
  const out = { direct: 0, observational: 0, pressure: 0 }
  for (const r of output.refined_recommendations) out[r.exposure_type] = (out[r.exposure_type] ?? 0) + 1
  return out
}

function countByConf(output: RefineOutput): { conf_high: number; conf_medium: number; conf_low: number } {
  const out = { conf_high: 0, conf_medium: 0, conf_low: 0 }
  for (const r of output.refined_recommendations) {
    if (r.confidence_band === 'high') out.conf_high++
    else if (r.confidence_band === 'medium') out.conf_medium++
    else if (r.confidence_band === 'low') out.conf_low++
  }
  return out
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function fmtPct(n: number, d: number): string {
  if (d === 0) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

async function processOne(
  theme: { id: string; name: string },
  dry: boolean,
  label: string
): Promise<ThemeResult> {
  const base: ThemeResult = {
    ok: false,
    theme_id: theme.id,
    theme_name: theme.name,
    before_count: 0,
    after_count: 0,
    direct: 0,
    observational: 0,
    pressure: 0,
    conf_high: 0,
    conf_medium: 0,
    conf_low: 0,
    explicit_removed: 0,
    implicit_removed: 0,
    implicit_removed_tickers: [],
    removed_tickers: [],
    summary: '',
    stats: null,
    error: null,
  }
  try {
    const input = await loadRefineInput(theme.id)
    if (!input) {
      base.error = 'no input loaded'
      return base
    }
    base.before_count = input.current_recs.length
    process.stderr.write(`${label} ▶ ${theme.name} (before=${input.current_recs.length})\n`)

    const { output, stats } = await callRefine(input)
    base.stats = stats
    base.summary = output.refinement_summary

    if (output.refined_recommendations.length === 0) {
      base.error = `no refined recs returned (stop_reason=${stats.stop_reason})`
      process.stderr.write(`${label} ✗ ${theme.name} · ${base.error}\n`)
      return base
    }

    const byType = countByType(output)
    const byConf = countByConf(output)
    base.after_count = output.refined_recommendations.length
    base.direct = byType.direct
    base.observational = byType.observational
    base.pressure = byType.pressure
    base.conf_high = byConf.conf_high
    base.conf_medium = byConf.conf_medium
    base.conf_low = byConf.conf_low

    if (dry) {
      base.ok = true
      base.input = input
      base.output = output
      process.stderr.write(
        `${label} ✓ DRY ${theme.name} · kept=${base.after_count} (d${base.direct}/o${base.observational}/p${base.pressure}) · $${stats.cost_usd.toFixed(4)}\n`
      )
      return base
    }

    const apply = await applyRefinement(theme.id, input, output)
    base.explicit_removed = apply.explicit_removed
    base.implicit_removed = apply.implicit_removed
    base.implicit_removed_tickers = apply.implicit_removed_tickers
    base.removed_tickers = [
      ...output.removed_from_existing.map((r) => r.ticker.toUpperCase()),
      ...apply.implicit_removed_tickers,
    ]
    base.ok = true
    base.input = input
    base.output = output
    process.stderr.write(
      `${label} ✓ ${theme.name} · kept=${base.after_count} (d${base.direct}/o${base.observational}/p${base.pressure}) · removed=${apply.explicit_removed + apply.implicit_removed} · $${stats.cost_usd.toFixed(4)} · ${stats.elapsed_sec.toFixed(1)}s\n`
    )
    return base
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e)
    process.stderr.write(`${label} ✗ ${theme.name} · ${base.error}\n`)
    return base
  }
}

function printLanguageSamples(themes: ThemeResult[], pickHints: string[]): void {
  const picked: ThemeResult[] = []
  for (const hint of pickHints) {
    const h = hint.toLowerCase()
    const m = themes.find(
      (t) => t.ok && t.theme_name.toLowerCase().includes(h) && !picked.includes(t)
    )
    if (m) picked.push(m)
  }
  while (picked.length < 3) {
    const next = themes.find((t) => t.ok && !picked.includes(t))
    if (!next) break
    picked.push(next)
  }

  console.log('')
  console.log('=== LANGUAGE SAMPLES (3 themes · BEFORE / AFTER) ===')
  for (const r of picked) {
    if (!r.output || !r.input) continue
    console.log('')
    console.log(`### ${r.theme_name}`)
    const samples = r.output.refined_recommendations.slice(0, 2)
    for (const ref of samples) {
      const orig = r.input.current_recs.find(
        (c: CurrentRec) => c.ticker_symbol.toUpperCase() === ref.ticker_symbol.toUpperCase()
      )
      if (!orig) continue
      console.log(`[${ref.ticker_symbol}] (${ref.exposure_type}, ${ref.confidence_band})`)
      console.log(`  BEFORE reasoning: ${truncate(orig.role_reasoning, 160)}`)
      console.log(`  AFTER  reasoning: ${truncate(ref.role_reasoning, 160)}`)
      console.log(`  BEFORE catalyst:  ${truncate(orig.catalyst, 120)}`)
      console.log(`  AFTER  catalyst:  ${truncate(ref.catalyst, 120)}`)
      console.log(`  BEFORE risk:      ${truncate(orig.risk, 120)}`)
      console.log(`  AFTER  risk:      ${truncate(ref.risk, 120)}`)
    }
  }
}

async function main() {
  const { limit, only, dry, concurrency } = parseArgs()
  const mode = limit ? `LIMIT=${limit}` : only ? `ONLY=${only.length}` : 'FULL'
  console.log('=== Rollout · Refine Recommendations ===')
  console.log(`Mode: ${mode}${dry ? ' · DRY (no writes)' : ''} · concurrency=${concurrency}`)

  const themes = await fetchThemes(limit, only)
  console.log(`Themes queued: ${themes.length}`)
  console.log('')

  if (themes.length === 0) {
    console.log('No themes to process. Exiting.')
    return
  }

  const started = Date.now()
  const results = await runPool<typeof themes[number], ThemeResult>(
    themes,
    concurrency,
    async (t, idx) => {
      const label = `[${idx + 1}/${themes.length}]`
      return processOne({ id: t.id, name: t.name }, dry, label)
    }
  )
  const wall = (Date.now() - started) / 1000

  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const totalCost = results.reduce((s, r) => s + (r.stats?.cost_usd ?? 0), 0)
  const totalInput = results.reduce((s, r) => s + (r.stats?.input_tokens ?? 0), 0)
  const totalOutput = results.reduce((s, r) => s + (r.stats?.output_tokens ?? 0), 0)
  const totalBefore = ok.reduce((s, r) => s + r.before_count, 0)
  const totalAfter = ok.reduce((s, r) => s + r.after_count, 0)
  const totalDirect = ok.reduce((s, r) => s + r.direct, 0)
  const totalObs = ok.reduce((s, r) => s + r.observational, 0)
  const totalPress = ok.reduce((s, r) => s + r.pressure, 0)
  const totalHigh = ok.reduce((s, r) => s + r.conf_high, 0)
  const totalMed = ok.reduce((s, r) => s + r.conf_medium, 0)
  const totalLow = ok.reduce((s, r) => s + r.conf_low, 0)
  const totalExplicit = ok.reduce((s, r) => s + r.explicit_removed, 0)
  const totalImplicit = ok.reduce((s, r) => s + r.implicit_removed, 0)

  console.log('')
  console.log('=== SUMMARY ===')
  console.log(`Success:       ${ok.length}/${results.length} (${fmtPct(ok.length, results.length)})`)
  console.log(`Failed:        ${failed.length}`)
  console.log(`Tickers:       ${totalBefore} → ${totalAfter} (Δ ${totalAfter - totalBefore})`)
  console.log(`Avg per theme: ${ok.length ? (totalAfter / ok.length).toFixed(1) : '0'}`)
  console.log('')
  console.log('Exposure Type:')
  console.log(`  direct         ${totalDirect.toString().padStart(3)} (${fmtPct(totalDirect, totalAfter)})`)
  console.log(`  observational  ${totalObs.toString().padStart(3)} (${fmtPct(totalObs, totalAfter)})`)
  console.log(`  pressure       ${totalPress.toString().padStart(3)} (${fmtPct(totalPress, totalAfter)})`)
  console.log('')
  console.log('Confidence:')
  console.log(`  high           ${totalHigh.toString().padStart(3)} (${fmtPct(totalHigh, totalAfter)})`)
  console.log(`  medium         ${totalMed.toString().padStart(3)} (${fmtPct(totalMed, totalAfter)})`)
  console.log(`  low            ${totalLow.toString().padStart(3)} (${fmtPct(totalLow, totalAfter)})`)
  console.log('')
  console.log(`Removed:       ${totalExplicit + totalImplicit} (explicit=${totalExplicit} · implicit=${totalImplicit})`)
  console.log(`Tokens:        in=${totalInput.toLocaleString()} · out=${totalOutput.toLocaleString()}`)
  console.log(`Total cost:    $${totalCost.toFixed(4)}`)
  console.log(`Wall time:     ${wall.toFixed(1)}s (${(wall / 60).toFixed(1)}m)`)

  if (failed.length > 0) {
    console.log('')
    console.log('--- FAILED ---')
    for (const f of failed) {
      console.log(`  ✗ ${f.theme_name} · ${f.error}`)
    }
  }

  console.log('')
  console.log('--- PER-THEME DETAIL ---')
  for (const r of results) {
    if (!r.ok) continue
    const minus = r.explicit_removed + r.implicit_removed
    console.log(
      `  ${r.theme_name.padEnd(55)} ${r.before_count.toString().padStart(3)} → ${r.after_count.toString().padStart(2)} · d${r.direct}/o${r.observational}/p${r.pressure} · -${minus}`
    )
  }

  if (!dry) printLanguageSamples(results, ['iran', 'rare earth', 'stablecoin'])
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
