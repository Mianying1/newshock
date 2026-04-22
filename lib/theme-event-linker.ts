import { anthropic, MODEL_SONNET } from './anthropic'
import { supabaseAdmin } from './supabase-admin'

interface CandidateEvent {
  id: string
  headline: string
  source_name: string | null
  event_date: string | null
}

const LOOKBACK_DAYS = 30

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
  const stop = new Set([
    'the', 'and', 'for', 'from', 'with', 'that', 'this', 'these', 'those',
    'their', 'them', 'have', 'been', 'will', 'into', 'over', 'under',
    'theme', 'subtheme', 'umbrella', 'including', 'through', 'across',
    'amid', 'despite', 'among', 'other', 'also', 'more', 'less', 'than',
  ])
  return Array.from(new Set(tokens.filter((t) => !stop.has(t))))
}

export async function linkEventsToTheme(themeId: string, lookbackDays = LOOKBACK_DAYS): Promise<{
  candidates_found: number
  confirmed: number
  cost_usd: number
  error?: string
}> {
  const { data: theme, error: themeErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary')
    .eq('id', themeId)
    .single()
  if (themeErr || !theme) return { candidates_found: 0, confirmed: 0, cost_usd: 0, error: themeErr?.message ?? 'not found' }

  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('ticker_symbol')
    .eq('theme_id', themeId)
  const tickerSymbols = (recs ?? []).map((r: { ticker_symbol: string }) => r.ticker_symbol).filter(Boolean)

  const keywords = extractKeywords(`${theme.name} ${theme.summary ?? ''}`).slice(0, 12)
  if (keywords.length === 0 && tickerSymbols.length === 0) {
    return { candidates_found: 0, confirmed: 0, cost_usd: 0 }
  }

  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString()

  const byTicker = new Map<string, CandidateEvent>()
  if (tickerSymbols.length > 0) {
    const { data: evs } = await supabaseAdmin
      .from('events')
      .select('id, headline, source_name, event_date, mentioned_tickers')
      .is('trigger_theme_id', null)
      .gte('event_date', since)
      .overlaps('mentioned_tickers', tickerSymbols)
      .limit(80)
    for (const e of evs ?? []) byTicker.set(e.id, e as CandidateEvent)
  }

  const byKeyword = new Map<string, CandidateEvent>()
  if (keywords.length > 0) {
    const topKeywords = keywords.slice(0, 6)
    const orClause = topKeywords
      .map((k) => `headline.ilike.%${k.replace(/[%_,]/g, '')}%`)
      .join(',')
    const { data: evs } = await supabaseAdmin
      .from('events')
      .select('id, headline, source_name, event_date')
      .is('trigger_theme_id', null)
      .gte('event_date', since)
      .or(orClause)
      .limit(100)
    for (const e of evs ?? []) byKeyword.set(e.id, e as CandidateEvent)
  }

  const candidateMap = new Map<string, CandidateEvent>()
  byTicker.forEach((v, k) => candidateMap.set(k, v))
  byKeyword.forEach((v, k) => candidateMap.set(k, v))
  const candidates = Array.from(candidateMap.values()).slice(0, 40)
  if (candidates.length === 0) return { candidates_found: 0, confirmed: 0, cost_usd: 0 }

  const system =
    'You decide which news events belong to a theme. Be strict — reject loosely related events. ' +
    'Return ONLY a JSON array of matching event ids. No prose.'

  const user =
    `Theme: ${theme.name}\nSummary: ${(theme.summary ?? '').slice(0, 500)}\n` +
    `Tickers: ${tickerSymbols.join(', ') || '(none)'}\n\n` +
    `Candidate events:\n` +
    candidates.map((c, i) => `${i + 1}. [${c.id}] ${c.headline}`).join('\n') +
    `\n\nReturn a JSON array of event ids that clearly belong to this theme. Example: ["id1","id2"]. Empty array if none match.`

  const msg = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const text = msg.content
    .flatMap((c) => (c.type === 'text' ? [c.text] : []))
    .join('')
    .trim()
  const inputTokens = msg.usage?.input_tokens ?? 0
  const outputTokens = msg.usage?.output_tokens ?? 0
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

  let confirmedIds: string[] = []
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]) as unknown
      if (Array.isArray(parsed)) {
        confirmedIds = parsed.filter((x): x is string => typeof x === 'string')
      }
    } catch {
      // ignore parse error
    }
  }
  const validIds = confirmedIds.filter((id) => candidateMap.has(id))
  if (validIds.length === 0) {
    return { candidates_found: candidates.length, confirmed: 0, cost_usd: costUsd }
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('events')
    .update({ trigger_theme_id: themeId })
    .in('id', validIds)
    .is('trigger_theme_id', null)
    .select('id')
  if (updErr) {
    return { candidates_found: candidates.length, confirmed: 0, cost_usd: costUsd, error: updErr.message }
  }
  const updatedCount = updated?.length ?? 0
  if (updatedCount > 0) {
    const { count } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('trigger_theme_id', themeId)
    await supabaseAdmin
      .from('themes')
      .update({ event_count: count ?? updatedCount })
      .eq('id', themeId)
  }
  return { candidates_found: candidates.length, confirmed: updatedCount, cost_usd: costUsd }
}
