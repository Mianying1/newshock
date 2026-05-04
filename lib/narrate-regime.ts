import { anthropic, MODEL_SONNET } from './anthropic'
import type { RegimeScores } from './market-regime'

export interface DimensionNarrative {
  en: string
  zh: string
}

export type RegimeDimensionKey =
  | 'earnings'
  | 'valuation'
  | 'fed'
  | 'economic'
  | 'credit'
  | 'sentiment'

export type DimensionNarratives = Record<RegimeDimensionKey, DimensionNarrative>

const KEYS: RegimeDimensionKey[] = ['earnings', 'valuation', 'fed', 'economic', 'credit', 'sentiment']

function buildPrompt(scores: RegimeScores, rawData: Record<string, unknown>): string {
  const dims = KEYS.map((k) => {
    const d = scores[k as keyof RegimeScores] as { score: number; reasoning: string }
    return `- ${k}: ${d.score}/10 — ${d.reasoning}`
  }).join('\n')

  return `You are a markets analyst writing brief, present-tense interpretations of where each macro dimension stands RIGHT NOW. Your audience already knows what each dimension measures — they want a read on the current state, not a definition.

Total regime: ${scores.total}/60 · ${scores.label} · guidance: ${scores.guidance}

Current readings:
${dims}

Underlying snapshot data (JSON):
${JSON.stringify(rawData, null, 2)}

Write a 1-2 sentence interpretation per dimension in BOTH English and Mandarin Chinese. Rules:
- Describe the *current state* and what it implies for risk-taking. NEVER explain how the score is calculated.
- Anchor on the actual numbers (cite levels like "Core PCE 3.2%" or "HY OAS 2.83%") so the reader sees the evidence.
- Note direction when relevant (e.g., "reaccelerating", "rolling over"). For inflation specifically, mention if PPI is leading CPI.
- Tone: factual, dense, present-tense. No hype, no hedging filler ("it appears that..."), no emojis, no italics, no UPPERCASE labels.
- Each blurb 25-50 English words / 40-80 Chinese characters. ZH should match EN content, not translate literally.
- Avoid restating the dimension name at the start of the sentence.

Output ONLY a JSON object with this exact shape, no preface, no markdown fence:
{
  "earnings":  { "en": "...", "zh": "..." },
  "valuation": { "en": "...", "zh": "..." },
  "fed":       { "en": "...", "zh": "..." },
  "economic":  { "en": "...", "zh": "..." },
  "credit":    { "en": "...", "zh": "..." },
  "sentiment": { "en": "...", "zh": "..." }
}`
}

export async function narrateRegime(
  scores: RegimeScores,
  rawData: Record<string, unknown>,
): Promise<DimensionNarratives | null> {
  const prompt = buildPrompt(scores, rawData)
  const resp = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = resp.content.find((c) => c.type === 'text')
  if (!block || block.type !== 'text') return null
  let text = block.text.trim()
  // Strip an accidental ```json fence if present.
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*|\s*```$/g, '')
  try {
    const parsed = JSON.parse(text) as DimensionNarratives
    for (const k of KEYS) {
      if (!parsed[k] || !parsed[k].en || !parsed[k].zh) return null
    }
    return parsed
  } catch {
    return null
  }
}
