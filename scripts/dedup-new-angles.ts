import { config } from 'dotenv'
config({ path: '.env.local' })

const PRICE_INPUT = 3 / 1_000_000
const PRICE_OUTPUT = 15 / 1_000_000

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

type Candidate = {
  id: string
  umbrella_theme_id: string
  angle_label: string
  angle_description: string | null
  proposed_tickers: string[] | null
  gap_reasoning: string | null
  confidence: number | null
  status: string
}

type Umbrella = { id: string; name: string }

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')

  const { data: cands } = await supabaseAdmin
    .from('new_angle_candidates')
    .select('id, umbrella_theme_id, angle_label, angle_description, proposed_tickers, gap_reasoning, confidence, status')
    .in('status', ['pending', 'approved'])
  const candidates = (cands ?? []) as Candidate[]

  const { data: umbs } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('theme_tier', 'umbrella')
  const umbById = new Map<string, Umbrella>()
  for (const u of (umbs ?? []) as Umbrella[]) umbById.set(u.id, u)

  const byUmbrella = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const arr = byUmbrella.get(c.umbrella_theme_id) ?? []
    arr.push(c)
    byUmbrella.set(c.umbrella_theme_id, arr)
  }

  console.log(`total candidates: ${candidates.length} across ${byUmbrella.size} umbrellas`)
  let totalCost = 0
  let totalMerged = 0

  for (const [uid, list] of byUmbrella) {
    if (list.length <= 1) { console.log(`· ${umbById.get(uid)?.name} · ${list.length} candidate · skip`); continue }

    const u = umbById.get(uid)!
    const numbered = list.map((c, i) => `[${i + 1}] ${c.angle_label}: ${(c.angle_description ?? '').slice(0, 160)}`).join('\n')

    const system =
      'You deduplicate a list of newly-proposed angles for one investment main line. ' +
      'Cluster items that describe the same beneficiary class or mechanism. ' +
      'Items are duplicates if they could be played with the same ticker basket and the same macro thesis, even if worded differently. ' +
      'Items are distinct if they target different beneficiary classes (e.g. ETF issuers vs ETF products vs ETF market makers).'

    const user =
      `Umbrella: ${u.name}\n\nProposed new angles (${list.length}):\n${numbered}\n\n` +
      `Return JSON only:\n` +
      `{"clusters":[{"keep_label":"Canonical Label","member_indices":[1,2,3],"merged_description":"<50 words"}]}\n` +
      `Every index 1..${list.length} must appear in exactly one cluster. A singleton cluster is fine.`

    try {
      const msg = await anthropic.messages.create({
        model: MODEL_SONNET,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = msg.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('').trim()
      const parsed = JSON.parse(extractFirstJson(text)) as {
        clusters: Array<{ keep_label: string; member_indices: number[]; merged_description: string }>
      }
      totalCost += (msg.usage?.input_tokens ?? 0) * PRICE_INPUT + (msg.usage?.output_tokens ?? 0) * PRICE_OUTPUT

      let merged = 0
      for (const cluster of parsed.clusters) {
        if (cluster.member_indices.length < 2) continue
        const members = cluster.member_indices.map((i) => list[i - 1]).filter(Boolean)
        if (members.length < 2) continue

        // Keep the one with highest confidence as canonical; promote to cluster's keep_label
        members.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        const keeper = members[0]
        const losers = members.slice(1)

        const mergedTickers = Array.from(new Set(members.flatMap((m) => m.proposed_tickers ?? [])))
        const mergedReasoning = members.map((m) => m.gap_reasoning).filter(Boolean).join(' · ').slice(0, 600)

        // Update keeper with canonical label + merged payload
        const { error: updErr } = await supabaseAdmin
          .from('new_angle_candidates')
          .update({
            angle_label: cluster.keep_label,
            angle_description: cluster.merged_description,
            proposed_tickers: mergedTickers,
            gap_reasoning: mergedReasoning,
          })
          .eq('id', keeper.id)
        if (updErr && !updErr.message.includes('duplicate')) throw new Error(`keeper update: ${updErr.message}`)

        // Delete losers
        const { error: delErr } = await supabaseAdmin
          .from('new_angle_candidates')
          .delete()
          .in('id', losers.map((l) => l.id))
        if (delErr) throw new Error(`delete losers: ${delErr.message}`)

        merged += losers.length
        console.log(`  merge ${u.name} · "${cluster.keep_label}" · absorbed ${losers.length} (${losers.map((l) => l.angle_label).join(' | ').slice(0, 100)})`)
      }
      totalMerged += merged
      console.log(`· ${u.name} · ${list.length} → ${list.length - merged} (merged ${merged})`)
    } catch (e) {
      console.error(`FAIL ${u.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`\ndone · merged ${totalMerged} duplicates · cost ~$${totalCost.toFixed(4)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
