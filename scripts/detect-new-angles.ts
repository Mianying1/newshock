import { config } from 'dotenv'
config({ path: '.env.local' })

const WINDOW_DAYS = 14
const CONFIDENCE_THRESHOLD = 0.7
const PRICE_INPUT = 3 / 1_000_000
const PRICE_OUTPUT = 15 / 1_000_000

type Angle = {
  key: string
  label_en: string
  label_zh: string
  description: string
  example_tickers?: string[]
}

type Umbrella = {
  id: string
  name: string
  summary: string | null
  expected_coverage: { angles: Angle[] } | null
}

type Theme = { id: string; name: string; parent_theme_id: string | null }

type Event = {
  id: string
  headline: string
  event_date: string
  mentioned_tickers: string[] | null
  trigger_theme_id: string | null
  classifier_reasoning: string | null
}

type ClassifyResult =
  | { fits_existing: true; angle_key: string; confidence: number }
  | {
      fits_existing: false
      angle_label: string
      angle_description: string
      proposed_tickers: string[]
      gap_reasoning: string
      confidence: number
    }

function extractFirstJson(raw: string): string {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = s.indexOf('{')
  if (start < 0) return s
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return s.slice(start)
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
  const umbrellas = (umbs ?? []) as Umbrella[]
  const umbById = new Map<string, Umbrella>()
  for (const u of umbrellas) umbById.set(u.id, u)
  console.log(`umbrellas with coverage: ${umbrellas.length}`)

  const { data: allThemes } = await supabaseAdmin
    .from('themes')
    .select('id, name, parent_theme_id')
  const themeById = new Map<string, Theme>()
  for (const t of (allThemes ?? []) as Theme[]) themeById.set(t.id, t)

  // Resolve each theme → its root umbrella (if any). Subtheme → parent → umbrella.
  function rootUmbrella(themeId: string): Umbrella | null {
    const direct = umbById.get(themeId)
    if (direct) return direct
    const t = themeById.get(themeId)
    if (!t?.parent_theme_id) return null
    return umbById.get(t.parent_theme_id) ?? null
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 86400 * 1000).toISOString()
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, headline, event_date, mentioned_tickers, trigger_theme_id, classifier_reasoning')
    .gte('event_date', since)
    .not('trigger_theme_id', 'is', null)
    .order('event_date', { ascending: false })
  const evs = (events ?? []) as Event[]
  console.log(`events in last ${WINDOW_DAYS}d with theme: ${evs.length}`)

  // Group events by umbrella
  const byUmbrella = new Map<string, Event[]>()
  for (const e of evs) {
    const u = e.trigger_theme_id ? rootUmbrella(e.trigger_theme_id) : null
    if (!u) continue
    const arr = byUmbrella.get(u.id) ?? []
    arr.push(e)
    byUmbrella.set(u.id, arr)
  }

  const dist: { umbrella: string; events: number }[] = []
  for (const [uid, e] of byUmbrella) dist.push({ umbrella: umbById.get(uid)!.name, events: e.length })
  dist.sort((a, b) => b.events - a.events)
  console.log('events per umbrella:')
  for (const d of dist) console.log(`  ${d.events.toString().padStart(3)} · ${d.umbrella}`)

  let totalCost = 0
  let classifiedCount = 0
  let newAngleCount = 0
  let approvedCount = 0
  let pendingCount = 0
  let belowThresholdCount = 0
  const failures: Array<{ event: string; error: string }> = []

  for (const [umbrellaId, umbrellaEvents] of byUmbrella) {
    const u = umbById.get(umbrellaId)!
    const existingAngles = u.expected_coverage?.angles ?? []
    const anglesList = existingAngles.map((a, i) => `${i + 1}. ${a.key} — ${a.label_en}: ${a.description.slice(0, 180)}`).join('\n')

    for (const e of umbrellaEvents) {
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
        const msg = await anthropic.messages.create({
          model: MODEL_SONNET,
          max_tokens: 600,
          system,
          messages: [{ role: 'user', content: user }],
        })
        const text = msg.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('').trim()
        const clean = extractFirstJson(text)
        const parsed = JSON.parse(clean) as ClassifyResult

        const inputTokens = msg.usage?.input_tokens ?? 0
        const outputTokens = msg.usage?.output_tokens ?? 0
        totalCost += inputTokens * PRICE_INPUT + outputTokens * PRICE_OUTPUT
        classifiedCount++

        if (!parsed.fits_existing) {
          newAngleCount++
          const status = parsed.confidence >= CONFIDENCE_THRESHOLD ? 'approved' : 'pending'
          if (status === 'approved') approvedCount++
          else { pendingCount++; if (parsed.confidence < CONFIDENCE_THRESHOLD) belowThresholdCount++ }

          const { error: insErr } = await supabaseAdmin
            .from('new_angle_candidates')
            .upsert(
              {
                umbrella_theme_id: umbrellaId,
                trigger_event_id: e.id,
                angle_label: parsed.angle_label,
                angle_description: parsed.angle_description,
                proposed_tickers: parsed.proposed_tickers,
                gap_reasoning: parsed.gap_reasoning,
                confidence: parsed.confidence,
                status,
                reviewed_at: status === 'approved' ? new Date().toISOString() : null,
              },
              { onConflict: 'umbrella_theme_id,angle_label', ignoreDuplicates: false }
            )
          if (insErr) throw new Error(`insert: ${insErr.message}`)

          console.log(`  NEW [${status}] ${u.name} · ${parsed.angle_label} · conf=${parsed.confidence.toFixed(2)} · "${e.headline.slice(0, 60)}"`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failures.push({ event: e.headline.slice(0, 80), error: msg })
        console.error(`  FAIL [${u.name}] "${e.headline.slice(0, 60)}" · ${msg}`)
      }
    }
  }

  console.log('\n=== Summary ===')
  console.log(`classified: ${classifiedCount}`)
  console.log(`new angles found: ${newAngleCount}`)
  console.log(`  approved (conf >= ${CONFIDENCE_THRESHOLD}): ${approvedCount}`)
  console.log(`  pending  (conf <  ${CONFIDENCE_THRESHOLD}): ${pendingCount}`)
  console.log(`total cost: ~$${totalCost.toFixed(4)}`)
  console.log(`failures: ${failures.length}`)
  for (const f of failures.slice(0, 10)) console.log(`  FAIL: ${f.event.slice(0, 60)} · ${f.error.slice(0, 100)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
