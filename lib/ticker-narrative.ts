/**
 * Ticker narrative generator (D phase)
 *
 * Lazy bilingual narrative for ticker detail page (02 Core Narrative section).
 * Cache table: ticker_narratives. See migration 20260426000001.
 *
 * Fallback ladder (driven by active theme count):
 *   active = 0  → no LLM, return null narrative; UI shows empty state
 *   active = 1  → single-theme prompt (no manufactured tension)
 *   active ≥ 2  → full v2 prompt (core_tension across themes)
 *
 * TODO(P1): when ticker-theme auto-mapping job runs, most tickers move from
 *   case 0/1 → case 2; that lifts narrative depth without prompt changes.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'
import { supabaseAdmin } from '@/lib/supabase-admin'

const PROMPT_VERSION = 'v1'
const MODEL_VERSION = `${MODEL_SONNET}-narrative-${PROMPT_VERSION}`
const TTL_MS = 24 * 60 * 60 * 1000
const RECENT_EVENT_DAYS = 30
const HERO_LINE_MAX_EN = 55
const HERO_LINE_MAX_ZH = 55
const NARRATIVE_TIMEOUT_MS = 30_000

const directionEnum = z.enum(['benefits', 'headwind', 'mixed', 'uncertain'])

const topThemeSchema = z.object({
  theme_id: z.string(),
  label: z.string().min(1),
  direction: directionEnum,
})

const blockSchema = z.object({
  hero_line: z.string().nullable(),
  top_themes: z.array(topThemeSchema).nullable(),
  core_tension: z.string().nullable(),
  why_benefits: z.string().nullable(),
  risk_sources: z.string().nullable(),
})

export const narrativeJsonSchema = z.object({
  en: blockSchema,
  zh: blockSchema,
})

export type NarrativeBlock = z.infer<typeof blockSchema>
export type NarrativeJson = z.infer<typeof narrativeJsonSchema>
export type ThemeDirection = z.infer<typeof directionEnum>

type ActiveTheme = {
  theme_id: string
  name: string
  exposure_pct: number | null
  exposure_direction: ThemeDirection | null
  role_reasoning: string | null
  archetype_category: string | null
}

type RecentEvent = {
  id: string
  headline: string
  impact: 'high' | 'medium'
}

type InputBundle = {
  symbol: string
  company_name: string | null
  sector: string | null
  themes: ActiveTheme[]
  events: RecentEvent[]
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export function computeThemesSignature(themes: { theme_id: string }[]): string {
  const ids = themes.map((t) => t.theme_id).sort()
  return sha256(JSON.stringify(ids))
}

export function computeInputHash(bundle: InputBundle): string {
  const stable = {
    symbol: bundle.symbol,
    themes: bundle.themes
      .map((t) => ({
        theme_id: t.theme_id,
        exposure_pct: t.exposure_pct,
        exposure_direction: t.exposure_direction,
        role_reasoning: t.role_reasoning ?? null,
      }))
      .sort((a, b) => a.theme_id.localeCompare(b.theme_id)),
    events: bundle.events
      .map((e) => ({ id: e.id, impact: e.impact }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
  return sha256(JSON.stringify(stable))
}

export async function fetchInputBundle(symbolUpper: string): Promise<InputBundle | null> {
  const { data: ticker, error: tErr } = await supabaseAdmin
    .from('tickers')
    .select('symbol, company_name, sector')
    .eq('symbol', symbolUpper)
    .maybeSingle()
  if (tErr) throw new Error(`fetchInputBundle.tickers: ${tErr.message}`)
  if (!ticker) return null

  const { data: recs, error: rErr } = await supabaseAdmin
    .from('theme_recommendations')
    .select(
      `theme_id, exposure_pct, exposure_direction, role_reasoning,
       themes!inner (id, name, status, archetype_id,
         theme_archetypes (category))`
    )
    .eq('ticker_symbol', symbolUpper)
  if (rErr) throw new Error(`fetchInputBundle.recs: ${rErr.message}`)

  type Row = {
    theme_id: string
    exposure_pct: number | null
    exposure_direction: string | null
    role_reasoning: string | null
    themes: {
      id: string
      name: string
      status: string
      archetype_id: string | null
      theme_archetypes: { category: string | null } | null
    } | null
  }
  const rows = (recs ?? []) as unknown as Row[]
  const themes: ActiveTheme[] = rows
    .filter((r) => r.themes?.status === 'active')
    .map((r) => ({
      theme_id: r.theme_id,
      name: r.themes!.name,
      exposure_pct: r.exposure_pct,
      exposure_direction: normalizeDirection(r.exposure_direction),
      role_reasoning: r.role_reasoning,
      archetype_category: r.themes?.theme_archetypes?.category ?? null,
    }))

  const sinceIso = new Date(Date.now() - RECENT_EVENT_DAYS * 86400000).toISOString()
  const { data: evs, error: eErr } = await supabaseAdmin
    .from('events')
    .select('id, short_headline, headline, level_of_impact, event_date')
    .contains('mentioned_tickers', [symbolUpper])
    .gte('event_date', sinceIso)
    .in('level_of_impact', ['high', 'medium'])
    .order('event_date', { ascending: false })
    .limit(20)
  if (eErr) throw new Error(`fetchInputBundle.events: ${eErr.message}`)
  const events: RecentEvent[] = (evs ?? []).map((e: any) => ({
    id: e.id,
    headline: e.short_headline ?? e.headline ?? '',
    impact: (e.level_of_impact === 'high' ? 'high' : 'medium') as 'high' | 'medium',
  }))

  return {
    symbol: ticker.symbol,
    company_name: ticker.company_name ?? null,
    sector: ticker.sector ?? null,
    themes,
    events,
  }
}

function normalizeDirection(s: string | null): ThemeDirection | null {
  if (!s) return null
  const v = s.toLowerCase()
  if (v === 'benefits' || v === 'headwind' || v === 'mixed' || v === 'uncertain') return v
  return null
}

function buildPrompt(bundle: InputBundle): string {
  const { symbol, company_name, sector, themes, events } = bundle
  const themeBlock = themes
    .map(
      (t, i) => `  ${i + 1}. theme_id="${t.theme_id}" name="${t.name}"
     exposure=${t.exposure_pct ?? '—'}% direction=${t.exposure_direction ?? 'uncertain'}
     archetype_category=${t.archetype_category ?? '—'}
     role_reasoning=${t.role_reasoning ?? '—'}`
    )
    .join('\n')
  const eventBlock = events.length
    ? events.map((e) => `  - [${e.impact}] ${e.headline}`).join('\n')
    : '  (no medium+ events in last 30d)'

  const isSingle = themes.length === 1
  const tensionRule = isSingle
    ? `core_tension: write FROM A SINGLE-THEME LENS — describe the central question this theme poses for ${symbol}, NOT a manufactured tension. Do not invent other themes.`
    : `core_tension: identify the genuine tension across the themes (e.g. structural growth + binary risk). 80–140 chars EN / 60–110 字 ZH.`
  const benefitRule = isSingle
    ? `why_benefits: 50–80 chars EN / 50–80 字 ZH. Honest and concise.`
    : `why_benefits: 100–160 chars EN / 80–130 字 ZH.`
  const riskRule = isSingle
    ? `risk_sources: 50–80 chars EN / 50–80 字 ZH. Honest and concise.`
    : `risk_sources: 100–160 chars EN / 80–130 字 ZH.`

  return `You are an equity analyst writing the "Core Narrative" panel for ${symbol} (${company_name ?? 'unknown'}, sector: ${sector ?? 'unknown'}).

Active themes attached to this ticker:
${themeBlock}

Recent (≤${RECENT_EVENT_DAYS}d, medium+ impact) events involving ${symbol}:
${eventBlock}

Output ONE JSON object — bilingual narrative (en + zh). Strict rules:

A) hero_line:
   - EN ≤ ${HERO_LINE_MAX_EN} characters · ZH ≤ ${HERO_LINE_MAX_ZH} 字
   - One sentence positioning ${symbol} relative to the dominant theme(s).

B) top_themes:
   - Up to 3 entries, ranked by exposure_pct desc.
   - Each: { theme_id, label (≤24 chars EN / ≤14 字 ZH), direction }.
   - direction MUST equal exposure_direction from the input. NEVER flip benefits↔headwind. If input is null, use "uncertain".

C) ${tensionRule}
D) ${benefitRule}
E) ${riskRule}

F) ZH must be independently authored — capture the same reasoning, NOT a literal translation.
G) No financial advice phrasing ("buy/sell/hold/recommend"). State conditions, not actions.
H) If a section cannot be honestly written from the inputs, set that field to null.

Return JSON ONLY (no prose, no code fences). Shape:
{
  "en": { "hero_line": "...", "top_themes": [...], "core_tension": "...", "why_benefits": "...", "risk_sources": "..." },
  "zh": { "hero_line": "...", "top_themes": [...], "core_tension": "...", "why_benefits": "...", "risk_sources": "..." }
}`
}

function clampLength(s: string | null, max: number): string | null {
  if (s == null) return null
  if (s.length <= max) return s
  return s.slice(0, max).trimEnd()
}

function postProcess(parsed: NarrativeJson, bundle: InputBundle): NarrativeJson {
  const directionByTheme = new Map(
    bundle.themes.map((t) => [t.theme_id, (t.exposure_direction ?? 'uncertain') as ThemeDirection])
  )
  function fixBlock(b: NarrativeBlock, heroMax: number): NarrativeBlock {
    return {
      ...b,
      hero_line: clampLength(b.hero_line, heroMax),
      top_themes:
        b.top_themes?.map((tt) => ({
          ...tt,
          direction: directionByTheme.get(tt.theme_id) ?? tt.direction,
        })) ?? null,
    }
  }
  return {
    en: fixBlock(parsed.en, HERO_LINE_MAX_EN),
    zh: fixBlock(parsed.zh, HERO_LINE_MAX_ZH),
  }
}

export async function generateNarrative(bundle: InputBundle): Promise<NarrativeJson | null> {
  if (bundle.themes.length === 0) return null

  const prompt = buildPrompt(bundle)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), NARRATIVE_TIMEOUT_MS)

  try {
    const resp = await anthropic.messages.create(
      {
        model: MODEL_SONNET,
        max_tokens: 1800,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: ac.signal }
    )
    const text = resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('LLM returned no JSON')
    const raw = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
    const parsed = narrativeJsonSchema.parse(raw)
    return postProcess(parsed, bundle)
  } finally {
    clearTimeout(timer)
  }
}

export type CacheRow = {
  ticker_symbol: string
  narratives_json: NarrativeJson | null
  generated_at: string
  input_hash: string
  themes_signature: string
  model_version: string
}

export async function readCache(symbolUpper: string): Promise<CacheRow | null> {
  const { data, error } = await supabaseAdmin
    .from('ticker_narratives')
    .select('ticker_symbol, narratives_json, generated_at, input_hash, themes_signature, model_version')
    .eq('ticker_symbol', symbolUpper)
    .maybeSingle()
  if (error) {
    Sentry.captureException(error, { tags: { stage: 'narrative_read_cache', symbol: symbolUpper } })
    return null
  }
  return (data as CacheRow | null) ?? null
}

export async function writeCache(
  symbolUpper: string,
  narrative: NarrativeJson | null,
  inputHash: string,
  themesSignature: string
): Promise<void> {
  const { error } = await supabaseAdmin.from('ticker_narratives').upsert(
    {
      ticker_symbol: symbolUpper,
      narratives_json: narrative,
      generated_at: new Date().toISOString(),
      input_hash: inputHash,
      themes_signature: themesSignature,
      model_version: MODEL_VERSION,
      last_accessed_at: new Date().toISOString(),
    },
    { onConflict: 'ticker_symbol' }
  )
  if (error) {
    Sentry.captureException(error, { tags: { stage: 'narrative_write_cache', symbol: symbolUpper } })
  }
}

export async function touchAccessed(symbolUpper: string): Promise<void> {
  await supabaseAdmin
    .from('ticker_narratives')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('ticker_symbol', symbolUpper)
}

export function isCacheFresh(row: CacheRow, currentInputHash: string, currentThemesSig: string): boolean {
  if (row.themes_signature !== currentThemesSig) return false
  if (row.input_hash !== currentInputHash) return false
  if (row.model_version !== MODEL_VERSION) return false
  const age = Date.now() - new Date(row.generated_at).getTime()
  return age < TTL_MS
}

export { MODEL_VERSION }
