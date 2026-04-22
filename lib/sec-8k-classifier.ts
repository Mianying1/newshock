import { anthropic, MODEL_SONNET } from './anthropic'
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
  items: string[]
  materiality: 'high' | 'medium' | 'low'
  action: EightKAction
  archetype_id: string | null
  reasoning: string
}

const IRRELEVANT_ONLY_ITEMS = new Set(['5.07', '5.08', '9.01'])

export function preFilter(items: string[]): { skip: boolean; reason: string } {
  if (items.length === 0) return { skip: false, reason: '' }
  const nonBoilerplate = items.filter((it) => !IRRELEVANT_ONLY_ITEMS.has(it))
  if (nonBoilerplate.length === 0) {
    return {
      skip: true,
      reason: `Only routine items (${items.join(',')}): shareholder votes / exhibits / nominations. Not market-moving.`,
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
  "reasoning": "1 short sentence"
}

Rules:
- "match_archetype": the filing is a material corporate event (1.01/2.01/7.01/8.01/etc.) that plausibly strengthens an existing archetype. Set archetype_id.
- "exploratory": material event but no archetype fits well. archetype_id = null.
- "irrelevant": routine (5.02 executive change, 2.02 pure earnings, 5.03 bylaws, 5.07 shareholder vote, 9.01 exhibits-only, 3.02 stock issuance that is not major) OR material but not thematically relevant (e.g., small-cap single-company debt restructuring).
- A mega-cap issuer with a non-routine item that could hint at broader theme (e.g., Apple 1.01 with a supplier) can still be exploratory.`

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
      items: context.items,
      materiality,
      action: 'irrelevant',
      archetype_id: null,
      reasoning: `[pre-filter] ${pre.reason}`,
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL_SONNET,
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
        items: context.items,
        materiality,
        action: 'error',
        archetype_id: null,
        reasoning: 'sonnet parse failed',
      }
    }
    const parsed = JSON.parse(jsonMatch[0]) as SonnetDecision
    return {
      event_id: event.id,
      ticker: context.ticker,
      items: context.items,
      materiality,
      action: parsed.action,
      archetype_id: parsed.archetype_id,
      reasoning: parsed.reasoning,
    }
  } catch (err) {
    return {
      event_id: event.id,
      ticker: context.ticker,
      items: context.items,
      materiality,
      action: 'error',
      archetype_id: null,
      reasoning: `sonnet error: ${(err as Error).message}`,
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
      updates.trigger_theme_id = activeTheme.id
    }
  }

  await supabaseAdmin.from('events').update(updates).eq('id', decision.event_id)
}
