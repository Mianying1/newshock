import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'

interface ArchetypeRow {
  id: string
  name: string
  description: string | null
  category: string | null
  is_active: boolean
}

interface UnmatchedEventRow {
  id: string
  headline: string
  source_name: string | null
  event_date: string
  mentioned_tickers: string[] | null
}

interface RegimeRow {
  snapshot_date: string
  regime_label: string | null
  regime_label_zh: string | null
  total_score: number | null
}

interface NarrativeRow {
  title: string
  description: string | null
  related_theme_ids: string[] | null
}

interface ThemeRow {
  name: string
  summary: string | null
}

export interface SuggestedArchetype {
  name: string
  name_zh: string
  category: string
  description: string
  description_zh: string
  priority: 'high' | 'medium' | 'low'
  reasoning: string
  suggested_tickers: string[]
  covers_unmatched_events?: string[]
  duration_type: 'extended' | 'bounded' | 'dependent'
}

export interface SuggestedMerger {
  existing_archetype_ids: string[]
  proposed_umbrella_name: string
  proposed_umbrella_name_zh: string
  reasoning: string
}

export interface SuggestedRebalancing {
  observation: string
  recommendation: string
}

export interface AuditPayload {
  overall_assessment: string
  overall_assessment_zh: string
  suggested_new_archetypes: SuggestedArchetype[]
  suggested_mergers: SuggestedMerger[]
  suggested_rebalancing: SuggestedRebalancing[]
}

export interface AuditReportRow extends AuditPayload {
  id: string
  report_date: string
  active_archetype_count: number
  unmatched_events_count: number
  market_regime_label: string | null
  market_regime_score: number | null
  created_at: string
  admin_reviewed_at: string | null
  admin_notes: string | null
  actions_taken: AuditAction[]
}

export interface AuditAction {
  type:
    | 'archetype_created'
    | 'archetype_rejected'
    | 'merger_approved'
    | 'merger_rejected'
    | 'note'
  date: string
  payload?: Record<string, unknown>
}

function buildAuditPrompt({
  archetypes,
  unmatched,
  regime,
  narratives,
  umbrellas,
  subthemes,
}: {
  archetypes: ArchetypeRow[]
  unmatched: UnmatchedEventRow[]
  regime: RegimeRow | null
  narratives: NarrativeRow[]
  umbrellas: ThemeRow[]
  subthemes: ThemeRow[]
}): string {
  const archetypeBlock = archetypes
    .map(
      (a) =>
        `- ${a.id}: ${a.name} (${a.category ?? 'n/a'})\n  ${a.description ?? '(no description)'}`
    )
    .join('\n\n')

  const unmatchedBlock = unmatched
    .slice(0, 50)
    .map((e) => `- [${e.id}] ${e.event_date.slice(0, 10)} · ${e.headline}`)
    .join('\n')

  const narrativesBlock = narratives
    .map((n) => `- ${n.title}: ${(n.description ?? '').slice(0, 200)}`)
    .join('\n')

  const umbrellaBlock = umbrellas
    .map((u) => `- ${u.name}${u.summary ? ': ' + u.summary.slice(0, 100) : ''}`)
    .join('\n')

  const subthemeBlock = subthemes
    .map((s) => `- ${s.name}${s.summary ? ': ' + s.summary.slice(0, 100) : ''}`)
    .join('\n')

  const regimeLine = regime
    ? `${regime.regime_label ?? 'n/a'} (${regime.total_score ?? '?'}/12)`
    : 'n/a'

  return `You are a senior macro investment strategist auditing Newshock's archetype library for completeness.

CURRENT ARCHETYPE LIBRARY (${archetypes.length} active):
${archetypeBlock}

CURRENT ACTIVE UMBRELLAS (${umbrellas.length}):
${umbrellaBlock || '(none)'}

CURRENT ACTIVE SUBTHEMES (${subthemes.length}):
${subthemeBlock || '(none)'}

RECENT UNMATCHED EVENTS (last 14 days, sample of ${Math.min(50, unmatched.length)} of ${unmatched.length} total):
${unmatchedBlock || '(none)'}

CURRENT MARKET REGIME: ${regimeLine}

TOP ACTIVE NARRATIVES:
${narrativesBlock || '(none)'}

===

AUDIT TASK:

Review the archetype library from 4 perspectives:

1. MACRO UMBRELLA COVERAGE
   Event-driven themes are well covered.
   But are STRUCTURAL MACRO UMBRELLA themes missing?

   Examples of umbrellas that should exist:
   - Commodities War Premium (geopolitics → 大宗商品溢价)
   - US Critical Minerals Reshoring (锂/铀/稀土本土化)
   - Western Battery Supply Chain Decoupling (脱钩中国电池)
   - Global Defense Spending Super-Cycle (全球国防超级周期)
   - Dedollarization + Hard Assets (去美元化 + 黄金/铜)
   - China Overcapacity Global Price War (中国产能过剩 · 全球价格战)
   - Energy Independence Long Cycle (能源独立长周期)
   - AI Capex Power Demand Multiplier (AI 基建 → 电力需求)
   - Sovereign Wealth Asset Relocation (主权财富资产转移)
   - Climate Adaptation Capital Cycle (气候适应资本周期)

   Check: Do we have these or equivalents? What's truly missing?

2. COUNTER / OPPOSING THEMES
   Every strong bull theme should have a bear counterpart if relevant.

   Example: If we have "Nuclear Renaissance" (bull uranium)
   Do we have "Nuclear Cost Overrun Risk" (counter) or similar?

   Or: Are we over-indexed on optimistic themes?

3. CROSS-THEME MERGER OPPORTUNITIES
   Are there 2-3 related sub-themes that should be merged into an umbrella?

   Example:
   - "Iran Crisis · Oil War"
   - "Israel Conflict Oil Impact"
   - "Venezuela Sanctions Oil"
   → Could merge into "Geopolitical Oil Premium" umbrella

4. EXISTING SUBTHEMES CLUSTERING (important)
   Review the 'Current Active Subthemes' list above.
   Are there 3+ subthemes that should cluster under a MISSING umbrella?

   Examples of the pattern:
   - 5 subthemes about AI datacenter/compute/power capex → should fit under an 'AI Capex & Infrastructure' umbrella
   - 4 subthemes about Fed/bank/rate/dollar → should fit under a 'Fed Rate Cycle Transition' umbrella
   - 6 subthemes about crypto ETF/exchange/stablecoin → should fit under a 'Crypto Institutional Infrastructure' umbrella
   - 4 subthemes about EV/battery/grid/nuclear → should fit under an 'Energy Transition Capex Cycle' umbrella

   Rules:
   - Only suggest if 3+ subthemes would genuinely cluster under the new umbrella.
   - Priority HIGH if 4+ subthemes fit. Priority MEDIUM if exactly 3 fit. Don't suggest if <3.
   - Do NOT propose an umbrella that duplicates one already in 'Current Active Umbrellas' above.
     (Check names AND scope — don't re-propose "AI Capex", "Fed Rate Cycle", "Crypto Institutional",
      "Energy Transition", "Pharma Innovation" or any near-synonym of an existing umbrella.)
   - Output clustered-from subthemes in the 'reasoning' field (list the subtheme names).
   - Use the same 'suggested_new_archetypes' output schema.

===

OUTPUT (valid JSON, no markdown):

{
  "overall_assessment": "2-3 sentences English summary",
  "overall_assessment_zh": "2-3 句中文总结",

  "suggested_new_archetypes": [
    {
      "name": "English Name",
      "name_zh": "中文名",
      "category": "geopolitics | ai_semi | supply_chain | pharma | macro_monetary | defense | energy | crypto | consumer | materials",
      "description": "Why this archetype is needed and what it covers (3-4 sentences)",
      "description_zh": "3-4 句中文描述",
      "priority": "high | medium | low",
      "reasoning": "Why missing. What tickers should be covered.",
      "suggested_tickers": ["TICKER1", "TICKER2", "TICKER3"],
      "covers_unmatched_events": ["event_id_from_list_above_if_applicable"],
      "duration_type": "extended | bounded | dependent"
    }
  ],

  "suggested_mergers": [
    {
      "existing_archetype_ids": ["id1", "id2"],
      "proposed_umbrella_name": "New Umbrella Name",
      "proposed_umbrella_name_zh": "新主题伞中文名",
      "reasoning": "why merge makes sense"
    }
  ],

  "suggested_rebalancing": [
    {
      "observation": "observation about imbalance",
      "recommendation": "what to do"
    }
  ]
}

Strict rules:
- Propose only HIGH-VALUE missing archetypes (not fluff)
- Each new archetype must cover 3+ real US-listed tickers (market cap > $500M)
- Priority reflects the current market environment
- Chinese translations must use professional investment terminology
- If library is sufficient for a category, return empty arrays

Return ONLY valid JSON, no markdown fences, no prose.`
}

function parseAuditResponse(text: string): AuditPayload {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not find JSON object in Sonnet response')

  const raw = JSON.parse(match[0]) as Partial<AuditPayload>

  return {
    overall_assessment: raw.overall_assessment ?? '',
    overall_assessment_zh: raw.overall_assessment_zh ?? '',
    suggested_new_archetypes: Array.isArray(raw.suggested_new_archetypes)
      ? raw.suggested_new_archetypes
      : [],
    suggested_mergers: Array.isArray(raw.suggested_mergers) ? raw.suggested_mergers : [],
    suggested_rebalancing: Array.isArray(raw.suggested_rebalancing)
      ? raw.suggested_rebalancing
      : [],
  }
}

export async function runCoverageAudit(): Promise<AuditReportRow> {
  const fourteenAgo = new Date(Date.now() - 14 * 86_400_000).toISOString()

  const [archsRes, unmatchedRes, regimeRes, narrativesRes, umbrellasRes, subthemesRes] =
    await Promise.all([
      supabaseAdmin
        .from('theme_archetypes')
        .select('id, name, description, category, is_active')
        .eq('is_active', true)
        .order('name'),
      supabaseAdmin
        .from('events')
        .select('id, headline, source_name, event_date, mentioned_tickers')
        .is('trigger_theme_id', null)
        .gte('event_date', fourteenAgo)
        .order('event_date', { ascending: false })
        .limit(100),
      supabaseAdmin
        .from('market_regime_snapshots')
        .select('snapshot_date, regime_label, regime_label_zh, total_score')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('market_narratives')
        .select('title, description, related_theme_ids')
        .eq('is_active', true)
        .order('generated_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('themes')
        .select('name, summary')
        .eq('theme_tier', 'umbrella')
        .in('status', ['active', 'cooling'])
        .order('name'),
      supabaseAdmin
        .from('themes')
        .select('name, summary')
        .eq('theme_tier', 'subtheme')
        .in('status', ['active', 'cooling'])
        .order('name'),
    ])

  if (archsRes.error) throw new Error(`archetypes fetch: ${archsRes.error.message}`)
  if (unmatchedRes.error) throw new Error(`unmatched fetch: ${unmatchedRes.error.message}`)

  const archetypes = (archsRes.data ?? []) as ArchetypeRow[]
  const unmatched = (unmatchedRes.data ?? []) as UnmatchedEventRow[]
  const regime = (regimeRes.data ?? null) as RegimeRow | null
  const narratives = (narrativesRes.data ?? []) as NarrativeRow[]
  const umbrellas = (umbrellasRes.data ?? []) as ThemeRow[]
  const subthemes = (subthemesRes.data ?? []) as ThemeRow[]

  const prompt = buildAuditPrompt({
    archetypes,
    unmatched,
    regime,
    narratives,
    umbrellas,
    subthemes,
  })

  let response
  try {
    response = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        tags: { function: 'runCoverageAudit', file: 'lib/coverage-audit.ts', model: MODEL_SONNET },
        extra: {
          archetype_count: archetypes.length,
          unmatched_count: unmatched.length,
          umbrella_count: umbrellas.length,
          subtheme_count: subthemes.length,
        },
      })
    }
    throw error
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed = parseAuditResponse(text)

  const reportDate = new Date().toISOString().slice(0, 10)

  const { data: report, error: insertErr } = await supabaseAdmin
    .from('coverage_audit_reports')
    .upsert(
      {
        report_date: reportDate,
        suggested_new_archetypes: parsed.suggested_new_archetypes,
        suggested_mergers: parsed.suggested_mergers,
        suggested_rebalancing: parsed.suggested_rebalancing,
        active_archetype_count: archetypes.length,
        unmatched_events_count: unmatched.length,
        market_regime_label: regime?.regime_label ?? null,
        market_regime_score: regime?.total_score ?? null,
        overall_assessment: parsed.overall_assessment,
        overall_assessment_zh: parsed.overall_assessment_zh,
      },
      { onConflict: 'report_date' }
    )
    .select()
    .single()

  if (insertErr) throw new Error(`insert report: ${insertErr.message}`)
  return report as AuditReportRow
}
