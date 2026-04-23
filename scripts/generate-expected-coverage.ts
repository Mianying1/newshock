import { config } from 'dotenv'
config({ path: '.env.local' })

const MIN_STRENGTH = 70
const STALE_DAYS = 30
const PRICE_INPUT = 3 / 1_000_000
const PRICE_OUTPUT = 15 / 1_000_000

type Umbrella = {
  id: string
  name: string
  summary: string | null
  archetype_id: string | null
  theme_strength_score: number | null
  coverage_generated_at: string | null
}
type Archetype = { id: string; playbook: Record<string, unknown> | null }
type Subtheme = { id: string; name: string; parent_theme_id: string }

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  const { data: umbs, error: umbErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary, archetype_id, theme_strength_score, coverage_generated_at')
    .eq('theme_tier', 'umbrella')
    .eq('status', 'active')
    .gte('theme_strength_score', MIN_STRENGTH)
    .order('theme_strength_score', { ascending: false })
  if (umbErr) throw new Error(`umbrella fetch: ${umbErr.message}`)
  const umbrellas = (umbs ?? []) as Umbrella[]
  console.log(`candidate umbrellas (strength >= ${MIN_STRENGTH}): ${umbrellas.length}`)

  const now = Date.now()
  const toProcess = umbrellas.filter((u) => {
    if (!u.coverage_generated_at) return true
    const age = (now - new Date(u.coverage_generated_at).getTime()) / (86400 * 1000)
    return age > STALE_DAYS
  })
  console.log(`to process (missing or > ${STALE_DAYS}d): ${toProcess.length}`)
  for (const u of umbrellas) {
    const skip = !toProcess.includes(u)
    console.log(`  ${skip ? '·' : '→'} ${u.theme_strength_score} ${u.name}`)
  }

  const archIds = Array.from(new Set(toProcess.map((u) => u.archetype_id).filter((x): x is string => !!x)))
  const { data: archs } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, playbook')
    .in('id', archIds)
  const archById = new Map<string, Archetype>()
  for (const a of (archs ?? []) as Archetype[]) archById.set(a.id, a)

  const { data: subs } = await supabaseAdmin
    .from('themes')
    .select('id, name, parent_theme_id')
    .in('parent_theme_id', toProcess.map((u) => u.id))
  const subsByParent = new Map<string, Subtheme[]>()
  for (const s of (subs ?? []) as Subtheme[]) {
    const arr = subsByParent.get(s.parent_theme_id) ?? []
    arr.push(s)
    subsByParent.set(s.parent_theme_id, arr)
  }

  let totalCost = 0
  const failures: Array<{ id: string; name: string; error: string }> = []

  for (let i = 0; i < toProcess.length; i++) {
    const u = toProcess[i]
    const arch = u.archetype_id ? archById.get(u.archetype_id) : null
    const children = subsByParent.get(u.id) ?? []

    const playbookSummary = arch?.playbook
      ? JSON.stringify({
          duration_type: (arch.playbook as Record<string, unknown>).duration_type,
          main_beneficiaries: (arch.playbook as Record<string, unknown>).main_beneficiaries,
          key_mechanisms: (arch.playbook as Record<string, unknown>).key_mechanisms,
          risk_factors: (arch.playbook as Record<string, unknown>).risk_factors,
        }).slice(0, 2500)
      : 'none'

    const system =
      'You map an investment "main line" to its structural angles. ' +
      'An angle = one distinct structural way to express the main line (a functional role, a layer of the value chain, or a second-order consequence). ' +
      'An angle is NOT a ticker, NOT a sub-event, NOT a date-bound news item. ' +
      'Output 6-10 angles that together would represent a complete playable coverage of this main line.'

    const user =
      `Umbrella main line: ${u.name}\n` +
      `Summary: ${(u.summary ?? 'n/a').slice(0, 600)}\n\n` +
      `Already-linked subthemes (${children.length}):\n` +
      (children.map((c) => `  - ${c.name}`).join('\n') || '  (none)') +
      `\n\nArchetype playbook highlights:\n${playbookSummary}\n\n` +
      `Return JSON only (no prose, no code fences):\n` +
      `{"angles":[{"key":"snake_case","label_en":"...","label_zh":"...","description":"<60 words","example_tickers":["TICK1","TICK2"]}]}`

    try {
      const msg = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: 2500,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = msg.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('').trim()
      const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      const parsed = JSON.parse(clean) as { angles: unknown[] }
      if (!Array.isArray(parsed.angles)) throw new Error('angles not array')

      const inputTokens = msg.usage?.input_tokens ?? 0
      const outputTokens = msg.usage?.output_tokens ?? 0
      const cost = inputTokens * PRICE_INPUT + outputTokens * PRICE_OUTPUT
      totalCost += cost

      const { error: updErr } = await supabaseAdmin
        .from('themes')
        .update({
          expected_coverage: { angles: parsed.angles },
          coverage_generated_at: new Date().toISOString(),
        })
        .eq('id', u.id)
      if (updErr) throw new Error(`update: ${updErr.message}`)

      console.log(`[${i + 1}/${toProcess.length}] ${u.name} · angles=${parsed.angles.length} · cost=$${cost.toFixed(4)}`)
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error(`[${i + 1}/${toProcess.length}] ${u.name} · FAILED: ${err}`)
      failures.push({ id: u.id, name: u.name, error: err })
    }
  }

  console.log(`\ndone · total cost ~$${totalCost.toFixed(4)} · failures=${failures.length}`)
  for (const f of failures) console.log(`  FAIL ${f.name}: ${f.error}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
