import * as fs from 'node:fs'
import * as path from 'node:path'
import { supabaseAdmin } from './supabase-admin'
import { anthropic } from './anthropic'

const PLAYBOOK_MODEL = 'claude-sonnet-4-6'

const PLAYBOOK_PROMPT = `You are a financial market historian and structural analyst.

For this thematic investing archetype, provide a historical playbook + "this time different" analysis.

Archetype: {name}
Description: {description}
Category: {category}

## Part 1: Historical Playbook
- typical_duration_label: Choose one from:
  'few weeks' | '1-3 months' | '3-6 months' | '6-12 months' | '12+ months'
- typical_duration_days_approx: [min_days, max_days] for calculations
- historical_cases (2-4 cases): Real historical examples of this theme type
  Each case MUST include:
  - name: Specific English event name (e.g., "2022 Russia-Ukraine Oil Shock")
  - name_zh: Faithful Chinese rendering (e.g., "2022 俄乌石油冲击")
  - approximate_duration: Use vague language like "约 1-2 个月" or "约 3-4 周"
  - peak_move / peak_move_zh: Qualitative market move description in English + Chinese
  - exit_trigger / exit_trigger_zh: What ended the theme cycle in English + Chinese
  - confidence: 'high' (very sure) or 'medium' (likely but imprecise)

  DO NOT fabricate cases. If uncertain, include fewer cases.
  DO NOT include 'low' confidence cases.

## Part 2: "This Time Different" Analysis
Identify 2-4 structural factors in the CURRENT environment (2026) that differ from historical analogs.

Consider these dimensions:
- demand_side: New demand driver? (e.g., AI inference for chips)
- supply_side: Different supply elasticity? (e.g., HBM technical barriers)
- macro: Similar or different macro regime?
- policy: Different government intervention?
- technology: Technology paradigm shift?

For each difference, specify:
- description / description_zh: English + Chinese description
- direction: 'may_extend' | 'may_shorten' | 'uncertain'
- confidence: 'high' or 'medium'

Also list 1-3 similarities with history — each with description + description_zh.

Conclude with ONE observation sentence in BOTH English (observation) and Chinese (observation_zh).

## Part 3: Exit Signals
3-5 concrete signals that historically marked the end of this theme cycle. Each entry is an object { "signal": "English text", "signal_zh": "中文文本" }.

## Rules
- Use "observed / may / approximate" language (NOT "will / predict / precisely")
- No price predictions or trade recommendations
- If uncertain about a dimension, OMIT rather than fabricate
- Focus on structural/observable factors
- Chinese text uses professional finance terminology (如 "需求端" "供给端" "估值" "退出信号" "结构性差异"). Preserve tickers/years/brand names unchanged.

Return JSON only matching this schema:
{
  "typical_duration_label": "...",
  "typical_duration_days_approx": [number, number],
  "historical_cases": [{"name": "...", "name_zh": "...", "approximate_duration": "...", "peak_move": "...", "peak_move_zh": "...", "exit_trigger": "...", "exit_trigger_zh": "...", "confidence": "high|medium"}],
  "this_time_different": {
    "differences": [{"dimension": "...", "description": "...", "description_zh": "...", "direction": "...", "confidence": "..."}],
    "similarities": [{"dimension": "...", "description": "...", "description_zh": "..."}],
    "observation": "...",
    "observation_zh": "..."
  },
  "exit_signals": [{"signal": "...", "signal_zh": "..."}],
  "duration_type": "bounded" | "extended" | "dependent",
  "duration_type_reasoning": "...",
  "duration_type_reasoning_zh": "...",
  "real_world_timeline": {
    "approximate_start": "...",
    "description": "...",
    "description_zh": "...",
    "current_maturity_estimate": "early" | "mid" | "late" | "beyond_typical"
  }
}

---

## Part 4: Duration Type Classification

Classify this archetype into ONE of 3 types:

1. 'bounded' — Clear start and end, finite typical duration.
2. 'extended' — Multi-year structural trend without clear endpoint.
3. 'dependent' — Derivative theme that fades as its parent trigger fades.

Provide duration_type + duration_type_reasoning (1 sentence) + duration_type_reasoning_zh.

## Part 5: Real-World Timeline

Based on your knowledge of current markets (as of Apr 2026), estimate WHEN this theme archetype began in the real world.
- approximate_start: e.g. '2023 Q2', '2020', 'recently emerging', 'recurring'
- description: 1 sentence describing real-world origin
- description_zh: Chinese version of description
- current_maturity_estimate: 'early' | 'mid' | 'late' | 'beyond_typical'

For genuinely new archetypes, use 'recently emerging' for approximate_start if unknown.`

interface PlaybookArchetypeInput {
  id: string
  name: string
  description: string | null
  category: string
}

async function callSonnetForPlaybook(arch: PlaybookArchetypeInput): Promise<unknown | null> {
  const prompt = PLAYBOOK_PROMPT
    .replace('{name}', arch.name)
    .replace('{description}', arch.description ?? '')
    .replace('{category}', arch.category)

  const response = await anthropic.messages.create({
    model: PLAYBOOK_MODEL,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = response.content[0]
  const text = block && block.type === 'text' ? block.text : ''
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  const sanitized = jsonMatch[0].replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  return JSON.parse(sanitized)
}

export async function generateArchetypePlaybook(
  archetypeId: string,
  options: { force?: boolean } = {}
): Promise<{ success: boolean; error?: string; playbook?: unknown; skipped?: boolean }> {
  const { data: arch, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, description, category, pipeline_status, playbook')
    .eq('id', archetypeId)
    .single()

  if (error || !arch) return { success: false, error: 'archetype not found' }

  if (
    !options.force &&
    arch.pipeline_status === 'ready' &&
    arch.playbook &&
    typeof arch.playbook === 'object' &&
    Object.keys(arch.playbook as Record<string, unknown>).length > 0
  ) {
    console.log(`[skip] ${archetypeId} already ready`)
    return { success: true, skipped: true, playbook: arch.playbook }
  }

  let playbook: unknown
  try {
    playbook = await callSonnetForPlaybook(arch as PlaybookArchetypeInput)
  } catch (e) {
    return { success: false, error: `sonnet: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!playbook) return { success: false, error: 'failed to parse playbook JSON' }

  const { playbookEn, playbookZh } = splitBilingualPlaybook(playbook as Record<string, unknown>)

  try {
    const outDir = path.join(process.cwd(), 'knowledge', 'playbooks')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, `${archetypeId}.json`), JSON.stringify(playbookEn, null, 2))
  } catch {
    // Serverless FS may be read-only — DB write is the source of truth, so don't fail
  }

  const { error: updateErr } = await supabaseAdmin
    .from('theme_archetypes')
    .update({ playbook: playbookEn, playbook_zh: playbookZh })
    .eq('id', archetypeId)
  if (updateErr) return { success: false, error: `db: ${updateErr.message}` }

  return { success: true, playbook: playbookEn }
}

function splitBilingualPlaybook(pb: Record<string, unknown>): {
  playbookEn: Record<string, unknown>
  playbookZh: Record<string, unknown>
} {
  const en: Record<string, unknown> = {}
  const zh: Record<string, unknown> = {}

  en.typical_duration_label = pb.typical_duration_label
  en.typical_duration_days_approx = pb.typical_duration_days_approx
  zh.typical_duration_label = pb.typical_duration_label
  zh.typical_duration_days_approx = pb.typical_duration_days_approx

  const cases = Array.isArray(pb.historical_cases) ? (pb.historical_cases as Array<Record<string, unknown>>) : []
  en.historical_cases = cases.map((c) => ({
    name: c.name,
    approximate_duration: c.approximate_duration,
    peak_move: c.peak_move,
    exit_trigger: c.exit_trigger,
    confidence: c.confidence,
  }))
  zh.historical_cases = cases.map((c) => ({
    name: c.name_zh ?? c.name,
    approximate_duration: c.approximate_duration,
    peak_move: c.peak_move_zh ?? c.peak_move,
    exit_trigger: c.exit_trigger_zh ?? c.exit_trigger,
    confidence: c.confidence,
  }))

  const ttd = (pb.this_time_different ?? {}) as Record<string, unknown>
  const diffs = Array.isArray(ttd.differences) ? (ttd.differences as Array<Record<string, unknown>>) : []
  const sims = Array.isArray(ttd.similarities) ? (ttd.similarities as Array<Record<string, unknown>>) : []
  en.this_time_different = {
    differences: diffs.map((d) => ({
      dimension: d.dimension,
      description: d.description,
      direction: d.direction,
      confidence: d.confidence,
    })),
    similarities: sims.map((s) => ({ dimension: s.dimension, description: s.description })),
    observation: ttd.observation,
  }
  zh.this_time_different = {
    differences: diffs.map((d) => ({
      dimension: d.dimension,
      description: d.description_zh ?? d.description,
      direction: d.direction,
      confidence: d.confidence,
    })),
    similarities: sims.map((s) => ({ dimension: s.dimension, description: s.description_zh ?? s.description })),
    observation: ttd.observation_zh ?? ttd.observation,
  }

  const signals = Array.isArray(pb.exit_signals) ? (pb.exit_signals as unknown[]) : []
  en.exit_signals = signals.map((s) =>
    typeof s === 'string' ? s : (s as Record<string, unknown>).signal ?? ''
  )
  zh.exit_signals = signals.map((s) =>
    typeof s === 'string'
      ? s
      : (s as Record<string, unknown>).signal_zh ?? (s as Record<string, unknown>).signal ?? ''
  )

  en.duration_type = pb.duration_type
  en.duration_type_reasoning = pb.duration_type_reasoning
  zh.duration_type = pb.duration_type
  zh.duration_type_reasoning = pb.duration_type_reasoning_zh ?? pb.duration_type_reasoning

  const rwt = (pb.real_world_timeline ?? {}) as Record<string, unknown>
  en.real_world_timeline = {
    approximate_start: rwt.approximate_start,
    description: rwt.description,
    current_maturity_estimate: rwt.current_maturity_estimate,
  }
  zh.real_world_timeline = {
    approximate_start: rwt.approximate_start,
    description: rwt.description_zh ?? rwt.description,
    current_maturity_estimate: rwt.current_maturity_estimate,
  }

  return { playbookEn: en, playbookZh: zh }
}

async function fetchLogoFromFMP(symbol: string): Promise<string | null> {
  const key = process.env.FMP_API_KEY
  if (!key) return null
  const res = await fetch(
    `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${key}`
  )
  if (!res.ok) return null
  const body = (await res.json()) as Array<{ image?: string }>
  return body[0]?.image ?? null
}

export async function fetchMissingTickerLogos(
  symbols: string[]
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = []
  const failed: string[] = []

  if (symbols.length === 0) return { succeeded, failed }

  const { data: rows } = await supabaseAdmin
    .from('tickers')
    .select('symbol, logo_url')
    .in('symbol', symbols)

  const needLogo = (rows ?? []).filter((r) => !r.logo_url).map((r) => r.symbol as string)

  for (const symbol of needLogo) {
    try {
      const logoUrl = await fetchLogoFromFMP(symbol)
      if (logoUrl) {
        const { error: updateErr } = await supabaseAdmin
          .from('tickers')
          .update({ logo_url: logoUrl })
          .eq('symbol', symbol)
        if (updateErr) failed.push(symbol)
        else succeeded.push(symbol)
      } else {
        failed.push(symbol)
      }
    } catch {
      failed.push(symbol)
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  return { succeeded, failed }
}

export async function runArchetypePipeline(
  archetypeId: string,
  tickerSymbols: string[],
  options: { force?: boolean } = {}
): Promise<void> {
  await supabaseAdmin
    .from('theme_archetypes')
    .update({ pipeline_status: 'generating' })
    .eq('id', archetypeId)

  let playbookSuccess = false
  let logoResults: { succeeded: string[]; failed: string[] } = { succeeded: [], failed: [] }
  const errors: string[] = []

  try {
    const r = await generateArchetypePlaybook(archetypeId, { force: options.force })
    if (r.success) playbookSuccess = true
    else errors.push(`playbook: ${r.error}`)
  } catch (e) {
    errors.push(`playbook exception: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    logoResults = await fetchMissingTickerLogos(tickerSymbols)
    if (logoResults.failed.length > 0) {
      errors.push(`logos failed: ${logoResults.failed.join(',')}`)
    }
  } catch (e) {
    errors.push(`logos exception: ${e instanceof Error ? e.message : String(e)}`)
  }

  const noLogoWorkNeeded = tickerSymbols.length === 0
  const logosOk = noLogoWorkNeeded || logoResults.failed.length === 0
  let finalStatus: 'ready' | 'failed' | 'partial'
  if (playbookSuccess && logosOk) finalStatus = 'ready'
  else if (!playbookSuccess && logoResults.succeeded.length === 0 && !noLogoWorkNeeded) finalStatus = 'failed'
  else if (!playbookSuccess && noLogoWorkNeeded) finalStatus = 'failed'
  else finalStatus = 'partial'

  await supabaseAdmin
    .from('theme_archetypes')
    .update({
      pipeline_status: finalStatus,
      pipeline_completed_at: new Date().toISOString(),
      pipeline_error: errors.length > 0 ? errors.join('; ') : null,
    })
    .eq('id', archetypeId)

  console.log(`[pipeline] ${archetypeId} finished: ${finalStatus}`)
}
