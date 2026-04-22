/**
 * Phase 7 · Ticker universe expansion.
 *
 * Usage:
 *   npx tsx scripts/expand-ticker-universe.ts --sample=5           # test run, 5 archetypes
 *   npx tsx scripts/expand-ticker-universe.ts --archetype-id=xxx   # single archetype
 *   npx tsx scripts/expand-ticker-universe.ts --all                # full rollout (~$5)
 *   npx tsx scripts/expand-ticker-universe.ts --dry-run            # no DB writes
 *
 * Pipeline per archetype:
 *   1. Skip if existing ticker_archetype_fit rows >= 15 (already populated).
 *   2. Build context: name / category / description / typical_tickers /
 *      5 recent themes + their recommendations.
 *   3. Sonnet generates 30-50 candidates (JSON array) with fit_score / exposure_label /
 *      evidence_summary(_zh). Explicitly excludes typical_tickers.
 *   4. FMP validates each candidate: exists · market_cap > $500M · not delisted.
 *   5. INSERT ticker_archetype_fit (data_source = 'fmp_validated' or 'ai_unverified').
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

type Archetype = {
  id: string
  name: string
  category: string
  description: string | null
  trigger_keywords: string[]
  typical_tickers: { tier1?: string[]; tier2?: string[]; tier3?: string[]; dynamic?: boolean } | null
}

let anthropic: Anthropic
let MODEL_SONNET: string
let supabaseAdmin: SupabaseClient
let loadActiveArchetypes: () => Promise<Archetype[]>

const FMP_BASE = 'https://financialmodelingprep.com/stable'
const MIN_MARKET_CAP_USD = 500_000_000
const TARGET_CANDIDATES_MIN = 30
const TARGET_CANDIDATES_MAX = 50
const EXISTING_ROWS_SKIP_THRESHOLD = 15
const MAX_EVIDENCE_LEN = 400

interface CliArgs {
  sample: number | null
  archetypeId: string | null
  all: boolean
  dryRun: boolean
}

interface CandidateRow {
  ticker_symbol: string
  company_name: string
  fit_score: number
  exposure_label: 'direct' | 'secondary' | 'peripheral' | 'pressure' | 'uncertain'
  relationship_type: string
  evidence_summary: string
  evidence_summary_zh: string
}

interface FMPValidation {
  ok: boolean
  market_cap: number | null
  reason: string | null
}

interface RunStats {
  archetypes_processed: number
  archetypes_skipped_existing: number
  candidates_proposed: number
  candidates_validated: number
  candidates_unverified: number
  duplicates_dropped: number
  rows_inserted: number
  cost_usd: number
  by_label: Record<string, number>
  errors: string[]
}

function parseArgs(): CliArgs {
  const args: CliArgs = { sample: null, archetypeId: null, all: false, dryRun: false }
  for (const arg of process.argv.slice(2)) {
    if (arg === '--all') args.all = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg.startsWith('--sample=')) args.sample = parseInt(arg.slice(9), 10)
    else if (arg.startsWith('--archetype-id=')) args.archetypeId = arg.slice(15)
  }
  if (!args.all && args.sample === null && args.archetypeId === null) {
    args.sample = 5
  }
  return args
}

async function countExistingFitRows(archetypeId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('ticker_archetype_fit')
    .select('ticker_symbol', { count: 'exact', head: true })
    .eq('archetype_id', archetypeId)
  return count ?? 0
}

async function fetchRecentThemeContext(archetypeId: string): Promise<string> {
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, theme_strength_score')
    .eq('archetype_id', archetypeId)
    .order('last_active_at', { ascending: false })
    .limit(5)
  if (!themes || themes.length === 0) return '(no recent themes)'
  const themeIds = themes.map((t: { id: string }) => t.id)
  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id, ticker_symbol, tier')
    .in('theme_id', themeIds)
    .limit(60)
  const byTheme = new Map<string, string[]>()
  for (const r of recs ?? []) {
    const row = r as { theme_id: string; ticker_symbol: string; tier: number }
    const list = byTheme.get(row.theme_id) ?? []
    list.push(`${row.ticker_symbol}(t${row.tier})`)
    byTheme.set(row.theme_id, list)
  }
  return themes
    .map((t: { id: string; name: string; summary: string | null; theme_strength_score: number }) => {
      const tickers = (byTheme.get(t.id) ?? []).slice(0, 8).join(', ') || '(none)'
      return `- ${t.name} [strength=${t.theme_strength_score}] tickers=[${tickers}]`
    })
    .join('\n')
}

function flattenTypicalTickers(typical: Archetype['typical_tickers']): string[] {
  if (!typical) return []
  return [...(typical.tier1 ?? []), ...(typical.tier2 ?? []), ...(typical.tier3 ?? [])]
}

async function proposeCandidates(
  archetype: Archetype,
  recentThemesBlock: string
): Promise<{ candidates: CandidateRow[]; cost_usd: number }> {
  const existingTickers = flattenTypicalTickers(archetype.typical_tickers)

  const system =
    'You map companies to an investment archetype. For each candidate ticker, output ' +
    'fit_score (0-10), exposure_label, relationship_type, and 2-3 sentence evidence. ' +
    'Be honest about uncertainty · skip tickers you are unsure about. Use cautious ' +
    'language (historically / may / tends to). Return ONLY a JSON array, no prose.'

  const user =
    `ARCHETYPE: ${archetype.name}\n` +
    `Category: ${archetype.category}\n` +
    `Description: ${archetype.description ?? '(none)'}\n` +
    `Trigger keywords: ${archetype.trigger_keywords.join(', ') || '(none)'}\n` +
    `Existing typical_tickers (DO NOT repeat): ${existingTickers.join(', ') || '(none)'}\n\n` +
    `RECENT THEMES under this archetype:\n${recentThemesBlock}\n\n` +
    `TASK:\n` +
    `List ${TARGET_CANDIDATES_MIN}-${TARGET_CANDIDATES_MAX} candidate tickers that have meaningful exposure to this archetype.\n\n` +
    `Rules:\n` +
    `- Exclude any ticker already in the typical_tickers list above.\n` +
    `- Cover global markets: US + Europe (.DE/.PA/.L) + Asia-Pacific (.T/2330.TW/00xxx.HK) where relevant.\n` +
    `- Include pressure candidates (companies harmed by the archetype) · use exposure_label="pressure".\n` +
    `- Use cautious language (historically / may / tends to). Avoid claims of causation.\n` +
    `- If you are not confident a ticker has real exposure, skip it.\n\n` +
    `Output a JSON array of objects:\n` +
    `[{\n` +
    `  "ticker_symbol": "XYZ",\n` +
    `  "company_name": "Company Inc",\n` +
    `  "fit_score": 7.5,           // 0-10\n` +
    `  "exposure_label": "direct" | "secondary" | "peripheral" | "pressure" | "uncertain",\n` +
    `  "relationship_type": "short phrase · e.g., 'key supplier' / 'downstream consumer'",\n` +
    `  "evidence_summary": "2-3 sentences · cautious · cite business segment if known",\n` +
    `  "evidence_summary_zh": "2-3 句中文 · 同义克制"\n` +
    `}]\n\n` +
    `Return ONLY the JSON array.`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 16000,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const text = msg.content
    .flatMap((c) => (c.type === 'text' ? [c.text] : []))
    .join('')
    .trim()

  const inputTokens = msg.usage?.input_tokens ?? 0
  const outputTokens = msg.usage?.output_tokens ?? 0
  const cost_usd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

  const stopReason = msg.stop_reason
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.warn(`  [propose] no JSON array matched · stop=${stopReason} · outTokens=${outputTokens}`)
    console.warn(`  [propose] raw head: ${text.slice(0, 200).replace(/\n/g, ' ')}`)
    console.warn(`  [propose] raw tail: ${text.slice(-200).replace(/\n/g, ' ')}`)
    return { candidates: [], cost_usd }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.warn(`  [propose] JSON.parse threw: ${(e as Error).message} · stop=${stopReason} · outTokens=${outputTokens}`)
    console.warn(`  [propose] raw tail: ${text.slice(-300).replace(/\n/g, ' ')}`)
    return { candidates: [], cost_usd }
  }
  if (!Array.isArray(parsed)) return { candidates: [], cost_usd }

  const valid: CandidateRow[] = []
  const existingSet = new Set(existingTickers.map((t) => t.toUpperCase()))
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const symbol = typeof r.ticker_symbol === 'string' ? r.ticker_symbol.toUpperCase().trim() : null
    const companyName = typeof r.company_name === 'string' ? r.company_name : null
    const score = typeof r.fit_score === 'number' ? r.fit_score : null
    const label = r.exposure_label
    const relType = typeof r.relationship_type === 'string' ? r.relationship_type : ''
    const ev = typeof r.evidence_summary === 'string' ? r.evidence_summary : ''
    const evZh = typeof r.evidence_summary_zh === 'string' ? r.evidence_summary_zh : ''
    if (!symbol || !companyName || score === null) continue
    if (existingSet.has(symbol)) continue
    const allowedLabels = new Set(['direct', 'secondary', 'peripheral', 'pressure', 'uncertain'])
    if (typeof label !== 'string' || !allowedLabels.has(label)) continue
    valid.push({
      ticker_symbol: symbol,
      company_name: companyName,
      fit_score: Math.max(0, Math.min(10, score)),
      exposure_label: label as CandidateRow['exposure_label'],
      relationship_type: relType.slice(0, 200),
      evidence_summary: ev.slice(0, MAX_EVIDENCE_LEN),
      evidence_summary_zh: evZh.slice(0, MAX_EVIDENCE_LEN),
    })
  }
  return { candidates: valid, cost_usd }
}

async function fmpValidate(symbol: string): Promise<FMPValidation> {
  const key = process.env.FMP_API_KEY
  if (!key) return { ok: false, market_cap: null, reason: 'FMP_API_KEY missing' }
  try {
    const res = await fetch(
      `${FMP_BASE}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${key}`
    )
    if (!res.ok) return { ok: false, market_cap: null, reason: `status ${res.status}` }
    const body = (await res.json()) as Array<{
      symbol?: string
      marketCap?: number
      isActivelyTrading?: boolean
    }>
    const row = body[0]
    if (!row) return { ok: false, market_cap: null, reason: 'not found' }
    if (row.isActivelyTrading === false) return { ok: false, market_cap: row.marketCap ?? null, reason: 'delisted' }
    const cap = typeof row.marketCap === 'number' ? row.marketCap : null
    if (cap !== null && cap < MIN_MARKET_CAP_USD) {
      return { ok: false, market_cap: cap, reason: `cap < $${MIN_MARKET_CAP_USD / 1e6}M` }
    }
    return { ok: true, market_cap: cap, reason: null }
  } catch (e) {
    return { ok: false, market_cap: null, reason: `fetch error: ${(e as Error).message}` }
  }
}

const LABEL_RANK: Record<string, number> = {
  direct: 5,
  pressure: 4,
  secondary: 3,
  peripheral: 2,
  uncertain: 1,
}

function dedupeBySymbol(
  rows: Array<CandidateRow & { validated: boolean; fmp_reason: string | null }>
): Array<CandidateRow & { validated: boolean; fmp_reason: string | null }> {
  const best = new Map<string, CandidateRow & { validated: boolean; fmp_reason: string | null }>()
  for (const r of rows) {
    const existing = best.get(r.ticker_symbol)
    if (!existing) {
      best.set(r.ticker_symbol, r)
      continue
    }
    if (r.fit_score > existing.fit_score) {
      best.set(r.ticker_symbol, r)
      continue
    }
    if (
      r.fit_score === existing.fit_score &&
      (LABEL_RANK[r.exposure_label] ?? 0) > (LABEL_RANK[existing.exposure_label] ?? 0)
    ) {
      best.set(r.ticker_symbol, r)
    }
  }
  return Array.from(best.values())
}

async function persistCandidates(
  archetypeId: string,
  rows: Array<CandidateRow & { validated: boolean; fmp_reason: string | null }>,
  dryRun: boolean
): Promise<{ inserted: number; duplicates_dropped: number }> {
  const deduped = dedupeBySymbol(rows)
  const duplicates_dropped = rows.length - deduped.length
  if (dryRun || deduped.length === 0) return { inserted: 0, duplicates_dropped }
  const payload = deduped.map((r) => ({
    ticker_symbol: r.ticker_symbol,
    archetype_id: archetypeId,
    fit_score: r.fit_score,
    exposure_label: r.exposure_label,
    relationship_type: r.relationship_type,
    evidence_summary: r.evidence_summary,
    evidence_summary_zh: r.evidence_summary_zh,
    data_source: r.validated ? 'fmp_validated' : 'ai_generated',
    last_validated_at: r.validated ? new Date().toISOString() : null,
  }))
  const { error } = await supabaseAdmin
    .from('ticker_archetype_fit')
    .upsert(payload, { onConflict: 'ticker_symbol,archetype_id' })
  if (error) {
    console.error('  [persist] upsert error:', error.message)
    return { inserted: 0, duplicates_dropped }
  }
  return { inserted: payload.length, duplicates_dropped }
}

async function processArchetype(
  archetype: Archetype,
  stats: RunStats,
  dryRun: boolean
): Promise<void> {
  console.log(`\n━━━ ${archetype.id} · ${archetype.name} ━━━`)
  const existing = await countExistingFitRows(archetype.id)
  if (existing >= EXISTING_ROWS_SKIP_THRESHOLD) {
    console.log(`  skip · already has ${existing} fit rows`)
    stats.archetypes_skipped_existing++
    return
  }
  console.log(`  existing fit rows: ${existing}`)

  const recentThemes = await fetchRecentThemeContext(archetype.id)
  const { candidates, cost_usd } = await proposeCandidates(archetype, recentThemes)
  stats.cost_usd += cost_usd
  stats.candidates_proposed += candidates.length
  console.log(`  proposed: ${candidates.length} candidates · cost=$${cost_usd.toFixed(4)}`)

  if (candidates.length === 0) {
    stats.errors.push(`${archetype.id}: no candidates`)
    return
  }

  const withValidation: Array<CandidateRow & { validated: boolean; fmp_reason: string | null }> = []
  for (const c of candidates) {
    const v = await fmpValidate(c.ticker_symbol)
    withValidation.push({ ...c, validated: v.ok, fmp_reason: v.reason })
    if (v.ok) stats.candidates_validated++
    else stats.candidates_unverified++
    stats.by_label[c.exposure_label] = (stats.by_label[c.exposure_label] ?? 0) + 1
  }

  const persist = await persistCandidates(archetype.id, withValidation, dryRun)
  stats.rows_inserted += persist.inserted
  stats.duplicates_dropped += persist.duplicates_dropped
  stats.archetypes_processed++
  if (persist.duplicates_dropped > 0) {
    console.log(`  dedupe: dropped ${persist.duplicates_dropped} within-batch duplicates`)
  }

  const preview = withValidation
    .slice()
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 8)
  for (const c of preview) {
    const flag = c.validated ? '✓' : '✗'
    const reason = c.validated ? '' : ` (${c.fmp_reason})`
    console.log(
      `    ${flag} ${c.ticker_symbol.padEnd(10)} ${c.fit_score.toFixed(1)} ${c.exposure_label.padEnd(10)} ${c.company_name}${reason}`
    )
  }
  const hiddenCount = withValidation.length - preview.length
  if (hiddenCount > 0) console.log(`    ... +${hiddenCount} more (not previewed)`)
}

async function main(): Promise<void> {
  const args = parseArgs()
  console.log('[expand-ticker-universe] args:', args)
  if (!process.env.FMP_API_KEY) {
    console.warn('[warn] FMP_API_KEY missing · all candidates will be ai_unverified')
  }

  const anthropicMod = await import('../lib/anthropic')
  anthropic = anthropicMod.anthropic
  MODEL_SONNET = anthropicMod.MODEL_SONNET
  const supaMod = await import('../lib/supabase-admin')
  supabaseAdmin = supaMod.supabaseAdmin
  const archMod = await import('../lib/archetype-loader')
  loadActiveArchetypes = archMod.loadActiveArchetypes

  const all = await loadActiveArchetypes()
  let targets: Archetype[] = all
  if (args.archetypeId) {
    targets = all.filter((a) => a.id === args.archetypeId)
  } else if (!args.all && args.sample !== null) {
    targets = all.slice(0, args.sample)
  }

  console.log(`[expand-ticker-universe] targets: ${targets.length} / ${all.length} archetypes`)
  if (args.dryRun) console.log('[dry-run] no DB writes')

  const stats: RunStats = {
    archetypes_processed: 0,
    archetypes_skipped_existing: 0,
    candidates_proposed: 0,
    candidates_validated: 0,
    candidates_unverified: 0,
    duplicates_dropped: 0,
    rows_inserted: 0,
    cost_usd: 0,
    by_label: {},
    errors: [],
  }

  for (const a of targets) {
    try {
      await processArchetype(a, stats, args.dryRun)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  [error] ${a.id}: ${msg}`)
      stats.errors.push(`${a.id}: ${msg}`)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`archetypes processed:   ${stats.archetypes_processed}`)
  console.log(`archetypes skipped:     ${stats.archetypes_skipped_existing} (already populated)`)
  console.log(`candidates proposed:    ${stats.candidates_proposed}`)
  console.log(`  validated (FMP):      ${stats.candidates_validated}`)
  console.log(`  unverified:           ${stats.candidates_unverified}`)
  console.log(`  duplicates dropped:   ${stats.duplicates_dropped}`)
  console.log(`rows inserted:          ${stats.rows_inserted}${args.dryRun ? ' (dry-run)' : ''}`)
  console.log(`by exposure_label:`)
  for (const [k, v] of Object.entries(stats.by_label)) {
    console.log(`  ${k.padEnd(12)}: ${v}`)
  }
  console.log(`total cost:             $${stats.cost_usd.toFixed(4)}`)
  if (stats.errors.length > 0) {
    console.log(`\nERRORS (${stats.errors.length}):`)
    for (const e of stats.errors) console.log(`  - ${e}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
