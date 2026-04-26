import * as Sentry from '@sentry/nextjs'
import { anthropic, MODEL_HAIKU } from './anthropic'
import { supabaseAdmin } from './supabase-admin'

export interface UmbrellaRef {
  id: string
  name: string
  summary: string | null
}

async function fetchActiveUmbrellas(): Promise<UmbrellaRef[]> {
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary')
    .eq('theme_tier', 'umbrella')
    .in('status', ['active', 'cooling'])
    .order('name')
  if (error) throw new Error(`umbrella fetch: ${error.message}`)
  return (data ?? []) as UmbrellaRef[]
}

export async function classifySubthemeParent(
  subtheme: { name: string; summary: string | null },
  umbrellas?: UmbrellaRef[]
): Promise<{ parent_id: string | null; cost_usd: number }> {
  const umbs = umbrellas ?? (await fetchActiveUmbrellas())
  if (umbs.length === 0) return { parent_id: null, cost_usd: 0 }

  const system =
    'You classify a subtheme under its most-fitting umbrella parent. ' +
    'Pick the umbrella whose scope clearly contains the subtheme. ' +
    'If no umbrella is a clear structural fit, reply "none".'

  const umbrellaList = umbs
    .map((u, i) => `${i + 1}. ${u.name}${u.summary ? ': ' + u.summary.slice(0, 220) : ''}`)
    .join('\n')

  const user =
    `Umbrella themes:\n${umbrellaList}\n\n` +
    `Subtheme:\nName: ${subtheme.name}\n` +
    `Summary: ${(subtheme.summary ?? '').slice(0, 600)}\n\n` +
    `Respond with ONLY the umbrella number (1-${umbs.length}) or "none". No other text.`

  let msg
  try {
    msg = await anthropic.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 10,
      system,
      messages: [{ role: 'user', content: user }],
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        tags: { function: 'classifySubthemeParent', file: 'lib/theme-tier.ts', model: MODEL_HAIKU },
        extra: { subtheme_name: subtheme.name, umbrella_count: umbs.length },
      })
    }
    throw error
  }

  const text = msg.content
    .flatMap((c) => (c.type === 'text' ? [c.text] : []))
    .join('')
    .trim()
    .toLowerCase()

  const inputTokens = msg.usage?.input_tokens ?? 0
  const outputTokens = msg.usage?.output_tokens ?? 0
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

  if (text === 'none') return { parent_id: null, cost_usd: costUsd }
  const n = parseInt(text.match(/\d+/)?.[0] ?? '', 10)
  if (!Number.isFinite(n) || n < 1 || n > umbs.length) {
    return { parent_id: null, cost_usd: costUsd }
  }
  return { parent_id: umbs[n - 1].id, cost_usd: costUsd }
}
