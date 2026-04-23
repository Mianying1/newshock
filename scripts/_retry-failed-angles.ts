import { config } from 'dotenv'
config({ path: '.env.local' })

const CONFIDENCE_THRESHOLD = 0.7
const WINDOW_DAYS = 14
const PRICE_INPUT = 3 / 1_000_000
const PRICE_OUTPUT = 15 / 1_000_000

const FAILED_HEADLINE_PREFIXES = [
  'Core Scientific seeks $3.3 billion bond sale',
  'Iran war drives Panama Canal',
  'Trump’s ‘dirty ceasefire’ tested',
  'Iran says it has seized two container ships',
  "Australia's Lynas flags higher sulfuric acid",
  'Vessels report being hit by gunfire',
  'Oil Surges 7% on Hormuz Blockade',
  "Bitcoin's 'Coinbase premium'",
]

function extractFirstJson(raw: string): string {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = s.indexOf('{')
  if (start < 0) return s
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return s.slice(start, i + 1) }
  }
  return s.slice(start)
}

type Angle = { key: string; label_en: string; description: string }
type Umbrella = { id: string; name: string; summary: string | null; expected_coverage: { angles: Angle[] } | null }
type Theme = { id: string; name: string; parent_theme_id: string | null }
type Event = {
  id: string; headline: string; event_date: string
  mentioned_tickers: string[] | null
  trigger_theme_id: string | null
  classifier_reasoning: string | null
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  const { data: umbs } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, expected_coverage')
    .eq('theme_tier', 'umbrella')
    .eq('status', 'active')
    .not('expected_coverage', 'is', null)
  const umbById = new Map<string, Umbrella>()
  for (const u of (umbs ?? []) as Umbrella[]) umbById.set(u.id, u)

  const { data: allThemes } = await supabaseAdmin.from('themes').select('id, name, parent_theme_id')
  const themeById = new Map<string, Theme>()
  for (const t of (allThemes ?? []) as Theme[]) themeById.set(t.id, t)
  const rootUmbrella = (tid: string) => umbById.get(tid) ?? (themeById.get(tid)?.parent_theme_id ? umbById.get(themeById.get(tid)!.parent_theme_id!) : null) ?? null

  const since = new Date(Date.now() - WINDOW_DAYS * 86400 * 1000).toISOString()
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, headline, event_date, mentioned_tickers, trigger_theme_id, classifier_reasoning')
    .gte('event_date', since)
    .not('trigger_theme_id', 'is', null)
  const matching = ((events ?? []) as Event[]).filter((e) =>
    FAILED_HEADLINE_PREFIXES.some((p) => e.headline.startsWith(p.slice(0, 30)))
  )
  console.log(`matching events to retry: ${matching.length}/${FAILED_HEADLINE_PREFIXES.length}`)

  let cost = 0, newCount = 0, fitCount = 0
  const stillFail: string[] = []

  for (const e of matching) {
    const u = e.trigger_theme_id ? rootUmbrella(e.trigger_theme_id) : null
    if (!u) { console.log(`  skip · no umbrella · ${e.headline.slice(0, 60)}`); continue }
    const existingAngles = u.expected_coverage?.angles ?? []
    const anglesList = existingAngles.map((a, i) => `${i + 1}. ${a.key} — ${a.label_en}: ${a.description.slice(0, 180)}`).join('\n')

    const system =
      'You classify a news event against an umbrella main line\'s pre-defined angles. ' +
      'Decide if the event fits an existing angle or represents a genuinely new structural angle. ' +
      'A new angle requires a distinct mechanism or beneficiary class not already listed — not just a new date-bound headline within an existing angle. ' +
      'Be strict: default to fits_existing unless the event clearly opens an angle none of the listed ones cover.'
    const user =
      `Umbrella: ${u.name}\nSummary: ${(u.summary ?? '').slice(0, 300)}\n\n` +
      `Existing angles (${existingAngles.length}):\n${anglesList}\n\n` +
      `Event:\nHeadline: ${e.headline.slice(0, 300)}\n` +
      `Mentioned tickers: ${(e.mentioned_tickers ?? []).join(', ') || 'none'}\n` +
      `Classifier context: ${(e.classifier_reasoning ?? '').slice(0, 300)}\n\n` +
      `Return JSON only. If it fits: {"fits_existing":true,"angle_key":"...","confidence":0.0-1.0}\n` +
      `If it is a new angle: {"fits_existing":false,"angle_label":"Short Title","angle_description":"<50 words","proposed_tickers":["T1","T2"],"gap_reasoning":"why not covered","confidence":0.0-1.0}`

    try {
      const msg = await anthropic.messages.create({ model: MODEL_SONNET, max_tokens: 600, system, messages: [{ role: 'user', content: user }] })
      const text = msg.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('').trim()
      const parsed = JSON.parse(extractFirstJson(text)) as { fits_existing: boolean; angle_key?: string; angle_label?: string; angle_description?: string; proposed_tickers?: string[]; gap_reasoning?: string; confidence: number }
      cost += (msg.usage?.input_tokens ?? 0) * PRICE_INPUT + (msg.usage?.output_tokens ?? 0) * PRICE_OUTPUT

      if (parsed.fits_existing) {
        fitCount++
        console.log(`  FIT ${u.name} · ${parsed.angle_key} · conf=${parsed.confidence.toFixed(2)} · ${e.headline.slice(0, 55)}`)
      } else {
        newCount++
        const status = parsed.confidence >= CONFIDENCE_THRESHOLD ? 'approved' : 'pending'
        await supabaseAdmin.from('new_angle_candidates').upsert(
          {
            umbrella_theme_id: u.id,
            trigger_event_id: e.id,
            angle_label: parsed.angle_label!,
            angle_description: parsed.angle_description!,
            proposed_tickers: parsed.proposed_tickers ?? [],
            gap_reasoning: parsed.gap_reasoning ?? '',
            confidence: parsed.confidence,
            status,
            reviewed_at: status === 'approved' ? new Date().toISOString() : null,
          },
          { onConflict: 'umbrella_theme_id,angle_label' }
        )
        console.log(`  NEW [${status}] ${u.name} · ${parsed.angle_label} · conf=${parsed.confidence.toFixed(2)}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stillFail.push(`${e.headline.slice(0, 60)} · ${msg}`)
      console.error(`  FAIL ${e.headline.slice(0, 60)} · ${msg}`)
    }
  }

  console.log(`\ndone · classified=${fitCount + newCount} · new=${newCount} · fit=${fitCount} · still_fail=${stillFail.length} · cost=$${cost.toFixed(4)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
