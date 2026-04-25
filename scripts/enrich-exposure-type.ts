/* eslint-disable no-console */
/**
 * Non-destructive exposure_type tagger.
 *
 *   tsx --env-file=.env.local scripts/enrich-exposure-type.ts            # all themes with NULL exposure_type
 *   tsx --env-file=.env.local scripts/enrich-exposure-type.ts --only id1,id2
 *   tsx --env-file=.env.local scripts/enrich-exposure-type.ts --dry      # no writes
 *
 * For each theme with rows missing exposure_type, asks Sonnet to label EVERY
 * such row with one of {direct | observational | pressure} + confidence band.
 * Does not delete or rewrite narrative fields. Designed for backfill, not
 * curation.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'

type ExposureType = 'direct' | 'observational' | 'pressure'
type ConfidenceBand = 'high' | 'medium' | 'low'

interface MissingRow {
  ticker_symbol: string
  company_name: string
  tier: number | null
  exposure_direction: string | null
  role_reasoning: string | null
  business_exposure: string | null
}

interface TagResult {
  ticker_symbol: string
  exposure_type: ExposureType
  confidence_band: ConfidenceBand
}

function parseArgs(): { only: string[] | null; dry: boolean } {
  const args = process.argv.slice(2)
  let only: string[] | null = null
  let dry = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--only') only = (args[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--dry') dry = true
  }
  return { only, dry }
}

async function findThemesWithMissingExposure(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id')
    .is('exposure_type', null)
  if (error) throw error
  return Array.from(new Set((data ?? []).map((r: any) => r.theme_id))).filter(Boolean) as string[]
}

async function loadTheme(themeId: string) {
  const { data } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary')
    .eq('id', themeId)
    .maybeSingle()
  return data as { id: string; name: string; summary: string | null } | null
}

async function loadMissingRows(themeId: string): Promise<MissingRow[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_recommendations')
    .select(
      'ticker_symbol, tier, exposure_direction, role_reasoning, business_exposure, tickers(company_name)',
    )
    .eq('theme_id', themeId)
    .is('exposure_type', null)
  if (error) throw error
  return (data ?? []).map((r: any) => {
    const t = Array.isArray(r.tickers) ? r.tickers[0] : r.tickers
    return {
      ticker_symbol: r.ticker_symbol,
      company_name: t?.company_name ?? r.ticker_symbol,
      tier: r.tier,
      exposure_direction: r.exposure_direction,
      role_reasoning: r.role_reasoning,
      business_exposure: r.business_exposure,
    }
  })
}

function buildPrompt(theme: { name: string; summary: string | null }, rows: MissingRow[]): string {
  const block = rows
    .map(
      (r, i) =>
        `${i + 1}. ${r.ticker_symbol} · ${r.company_name} · T${r.tier ?? '?'} · dir=${r.exposure_direction ?? '?'}\n   reasoning: ${(r.role_reasoning ?? '').slice(0, 160)}\n   exposure: ${(r.business_exposure ?? '').slice(0, 120)}`,
    )
    .join('\n')

  return `Classify each ticker by its EXPOSURE TYPE to the theme below.

THEME: ${theme.name}
${theme.summary ? `SUMMARY: ${theme.summary}` : ''}

TICKERS TO CLASSIFY (${rows.length}):
${block}

Categories:
- direct        → company's core business IS the theme (>70% revenue tied)
- observational → historical correlation / sector exposure, not a pure bet
- pressure      → theme creates cost / demand / competitive PRESSURE on this name (cost squeeze, substitute, displaced incumbent, downstream margin)

Confidence band:
- high   → multiple signals align; clear exposure
- medium → single-signal, plausible but needs confirmation
- low    → speculative / peripheral / derivative

Return JSON only. Classify EVERY ticker — do not omit any:

{
  "tags": [
    { "ticker_symbol": "TICKER", "exposure_type": "direct|observational|pressure", "confidence_band": "high|medium|low" }
  ]
}`
}

function parseTags(text: string): TagResult[] {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) return []
  try {
    const obj = JSON.parse(m[0])
    return (obj.tags ?? []) as TagResult[]
  } catch {
    return []
  }
}

async function processTheme(themeId: string, dry: boolean) {
  const theme = await loadTheme(themeId)
  if (!theme) return { ok: false, themeId, themeName: '?', missing: 0, filled: 0, cost: 0, err: 'theme not found' }

  const rows = await loadMissingRows(themeId)
  if (rows.length === 0) return { ok: true, themeId, themeName: theme.name, missing: 0, filled: 0, cost: 0 }

  process.stderr.write(`▶ ${theme.name} (missing=${rows.length})\n`)
  const prompt = buildPrompt(theme, rows)
  const started = Date.now()
  const resp = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = resp.content[0]
  const text = block && block.type === 'text' ? block.text : ''
  const tags = parseTags(text)
  const elapsed = (Date.now() - started) / 1000
  const cost = ((resp.usage?.input_tokens ?? 0) * 3 + (resp.usage?.output_tokens ?? 0) * 15) / 1_000_000

  if (tags.length === 0) {
    process.stderr.write(`  ! ${theme.name} · parse failed (stop=${resp.stop_reason})\n`)
    return { ok: false, themeId, themeName: theme.name, missing: rows.length, filled: 0, cost, err: 'parse failed' }
  }

  const missingSet = new Set(rows.map((r) => r.ticker_symbol.toUpperCase()))
  let filled = 0
  for (const tag of tags) {
    const sym = tag.ticker_symbol.toUpperCase()
    if (!missingSet.has(sym)) continue
    if (!['direct', 'observational', 'pressure'].includes(tag.exposure_type)) continue
    if (!['high', 'medium', 'low'].includes(tag.confidence_band)) continue
    if (dry) {
      filled++
      continue
    }
    const { error, count } = await supabaseAdmin
      .from('theme_recommendations')
      .update(
        { exposure_type: tag.exposure_type, confidence_band: tag.confidence_band },
        { count: 'exact' },
      )
      .eq('theme_id', themeId)
      .eq('ticker_symbol', sym)
      .is('exposure_type', null)
    if (error) {
      process.stderr.write(`  ! ${sym}: ${error.message}\n`)
      continue
    }
    filled += count ?? 0
  }
  process.stderr.write(
    `  ✓ ${theme.name} · filled ${filled}/${rows.length}${dry ? ' (DRY)' : ''} · $${cost.toFixed(4)} · ${elapsed.toFixed(1)}s\n`,
  )
  return { ok: true, themeId, themeName: theme.name, missing: rows.length, filled, cost }
}

async function main() {
  const { only, dry } = parseArgs()
  const themeIds = only && only.length > 0 ? only : await findThemesWithMissingExposure()
  console.log(`=== exposure_type tagger ===`)
  console.log(`Themes to process: ${themeIds.length}${dry ? ' · DRY' : ''}`)

  let totalMissing = 0
  let totalFilled = 0
  let totalCost = 0
  const failed: string[] = []
  for (const id of themeIds) {
    try {
      const r = await processTheme(id, dry)
      if (!r.ok) failed.push(`${id} · ${r.err}`)
      totalMissing += r.missing
      totalFilled += r.filled
      totalCost += r.cost
      await new Promise((res) => setTimeout(res, 250))
    } catch (e) {
      failed.push(`${id} · ${(e as Error).message}`)
    }
  }
  console.log('')
  console.log('=== SUMMARY ===')
  console.log(`Total missing:  ${totalMissing}`)
  console.log(`Filled:         ${totalFilled}`)
  console.log(`Remaining:      ${totalMissing - totalFilled}`)
  console.log(`Cost:           $${totalCost.toFixed(4)}`)
  if (failed.length > 0) {
    console.log('Failures:')
    for (const f of failed) console.log(`  ${f}`)
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
