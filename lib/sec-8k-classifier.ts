import { anthropic, MODEL_HAIKU } from './anthropic'
import { supabaseAdmin } from './supabase-admin'
import {
  SEC8KContext,
  classifyItemsMateriality,
  ITEM_LABELS,
} from './sec-8k-parser'
import { loadActiveArchetypes } from './archetype-loader'

export type EightKAction = 'irrelevant' | 'match_archetype' | 'exploratory' | 'error'

export interface EightKDecision {
  event_id: string
  ticker: string | null
  cik: string | null
  items: string[]
  materiality: 'high' | 'medium' | 'low'
  action: EightKAction
  archetype_id: string | null
  reasoning: string
  reasoning_zh: string | null
}

// Cap repeat 8-K filings from the same CIK on the same theme within 30 days.
// Audit found single filers (AAOI on CPO, Vertiv on AI Capex, USAR on Rare Earth)
// generating 6+ events on one theme — most were routine disclosures.
const PER_FILER_THEME_CAP = 2
const PER_FILER_WINDOW_DAYS = 30

// Allowlist of signal-bearing 8-K item codes. Filings with NO allowed items
// are dropped at pre-filter (audit found bulk-pull noise was the #1 attachment
// pollution source — board changes (5.02), Reg FD (7.01), exhibit-only (9.01),
// bylaw amends (5.03) etc. were being treated as theme catalysts).
const ALLOWED_8K_ITEMS = new Set([
  '1.01', // Material Definitive Agreement
  '1.02', // Termination of Material Definitive Agreement
  '1.03', // Bankruptcy or Receivership
  '2.01', // Completion of Acquisition or Disposition
  '2.02', // Results of Operations (earnings)
  '2.03', // Creation of Material Financial Obligation
  '2.04', // Triggering Events Accelerating Financial Obligation
  '2.05', // Costs Associated with Exit or Disposal
  '2.06', // Material Impairments
  '4.02', // Non-Reliance on Prior Financials
  '5.01', // Changes in Control
  '5.07', // Submission of Matters to a Vote
  '8.01', // Other Events (issuer-elected material disclosure)
])

export function preFilter(items: string[]): { skip: boolean; reason: string } {
  if (items.length === 0) return { skip: false, reason: '' }
  const allowed = items.filter((it) => ALLOWED_8K_ITEMS.has(it))
  if (allowed.length === 0) {
    return {
      skip: true,
      reason: `No allowlisted items (filed: ${items.join(',')}). Dropped as routine (board / FD / exhibits / bylaws).`,
    }
  }
  return { skip: false, reason: '' }
}

const SYSTEM_PROMPT = `You are a specialist classifier for SEC 8-K filings.

A filing is relevant to thematic investing ONLY IF the material item points to a development that plausibly connects to one of the provided investment archetypes. Most 8-K filings are routine corporate housekeeping and should be marked irrelevant.

Return JSON only:
{
  "action": "irrelevant" | "match_archetype" | "exploratory",
  "archetype_id": "string or null",
  "reasoning": "1 short English sentence",
  "reasoning_zh": "1 句中文简短描述"
}

Rules:
- "match_archetype": the filing is a material corporate event (1.01/2.01/7.01/8.01/etc.) that plausibly strengthens an existing archetype. Set archetype_id.
- "exploratory": material event but no archetype fits well. archetype_id = null.
- "irrelevant": routine (5.02 executive change, 2.02 pure earnings, 5.03 bylaws, 5.07 shareholder vote, 9.01 exhibits-only, 3.02 stock issuance that is not major) OR material but not thematically relevant (e.g., small-cap single-company debt restructuring).
- A mega-cap issuer with a non-routine item that could hint at broader theme (e.g., Apple 1.01 with a supplier) can still be exploratory.
- reasoning_zh: accurate Chinese translation using standard finance terminology (如 "物料事件" "暴露" "利好" "承压"). Preserve tickers/CIK/years unchanged.`

function buildUserPrompt(
  context: SEC8KContext,
  headline: string,
  eventDate: string,
  archetypesBlock: string
): string {
  const itemDescriptions = context.items.map(
    (it) => `- ${it} (${ITEM_LABELS[it] ?? 'Unknown'})`
  ).join('\n') || '(no items parsed)'

  return `Filing: ${headline}
Event date: ${eventDate}
Company: ${context.company_name}
Ticker: ${context.ticker ?? 'unknown'}
CIK: ${context.cik}
Items filed:
${itemDescriptions}

Available archetypes (current active):
${archetypesBlock}

Decide action + archetype_id. Return JSON only.`
}

interface SonnetDecision {
  action: EightKAction
  archetype_id: string | null
  reasoning: string
  reasoning_zh?: string | null
}

export async function classify8KEvent(
  event: {
    id: string
    headline: string
    event_date: string | null
    source_url: string | null
  },
  context: SEC8KContext,
  archetypesBlock: string
): Promise<EightKDecision> {
  const materiality = classifyItemsMateriality(context.items)
  const pre = preFilter(context.items)

  if (pre.skip) {
    return {
      event_id: event.id,
      ticker: context.ticker,
      cik: context.cik,
      items: context.items,
      materiality,
      action: 'irrelevant',
      archetype_id: null,
      reasoning: `[pre-filter] ${pre.reason}`,
      reasoning_zh: `[预过滤] 仅含例行事项 (${context.items.join(',')}),非市场敏感`,
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(context, event.headline, event.event_date ?? 'unknown', archetypesBlock),
        },
      ],
    })

    const block = response.content[0]
    const text = block && block.type === 'text' ? block.text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        event_id: event.id,
        ticker: context.ticker,
        cik: context.cik,
        items: context.items,
        materiality,
        action: 'error',
        archetype_id: null,
        reasoning: 'sonnet parse failed',
        reasoning_zh: 'sonnet 解析失败',
      }
    }
    const parsed = JSON.parse(jsonMatch[0]) as SonnetDecision
    return {
      event_id: event.id,
      ticker: context.ticker,
      cik: context.cik,
      items: context.items,
      materiality,
      action: parsed.action,
      archetype_id: parsed.archetype_id,
      reasoning: parsed.reasoning,
      reasoning_zh: parsed.reasoning_zh ?? null,
    }
  } catch (err) {
    return {
      event_id: event.id,
      ticker: context.ticker,
      cik: context.cik,
      items: context.items,
      materiality,
      action: 'error',
      archetype_id: null,
      reasoning: `sonnet error: ${(err as Error).message}`,
      reasoning_zh: `sonnet 错误: ${(err as Error).message}`,
    }
  }
}

export function buildArchetypeBlock(
  archetypes: Awaited<ReturnType<typeof loadActiveArchetypes>>
): string {
  return archetypes
    .map((a) => `- ${a.id}: ${a.name} — ${a.description ?? ''}`)
    .join('\n')
}

async function isFilerCappedOnTheme(themeId: string, cik: string): Promise<boolean> {
  const sinceIso = new Date(Date.now() - PER_FILER_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
  const { count, error } = await supabaseAdmin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('trigger_theme_id', themeId)
    .ilike('headline', `%(${cik})%`)
    .gte('event_date', sinceIso)
  if (error) return false
  return (count ?? 0) >= PER_FILER_THEME_CAP
}

export async function applyDecision(decision: EightKDecision): Promise<void> {
  const tagPrefix =
    decision.action === 'match_archetype'
      ? `[8-K ${decision.items.join(',')} · ${decision.materiality}]`
      : decision.action === 'exploratory'
      ? `[8-K exploratory · ${decision.items.join(',')}]`
      : `[8-K irrelevant · ${decision.items.join(',') || 'no-items'}]`

  const updates: Record<string, unknown> = {
    classifier_reasoning: `${tagPrefix} ${decision.reasoning}`,
    mentioned_tickers: decision.ticker ? [decision.ticker] : null,
    level_of_impact:
      decision.action === 'match_archetype' ? 'subtheme' :
      decision.action === 'exploratory' ? 'subtheme' :
      'event_only',
  }

  if (decision.action === 'match_archetype' && decision.archetype_id) {
    const { data: themes } = await supabaseAdmin
      .from('themes')
      .select('id, name, theme_strength_score, last_active_at')
      .eq('archetype_id', decision.archetype_id)
      .in('status', ['active', 'cooling'])
      .order('theme_strength_score', { ascending: false })
      .limit(1)

    const activeTheme = themes?.[0]
    if (activeTheme) {
      const capped = decision.cik
        ? await isFilerCappedOnTheme(activeTheme.id, decision.cik)
        : false
      if (capped) {
        updates.classifier_reasoning = `[8-K dedup-cap · CIK ${decision.cik} ≥${PER_FILER_THEME_CAP}/${PER_FILER_WINDOW_DAYS}d] ${decision.reasoning}`
        updates.level_of_impact = 'event_only'
      } else {
        updates.trigger_theme_id = activeTheme.id
      }
    }
  }

  await supabaseAdmin.from('events').update(updates).eq('id', decision.event_id)
}
