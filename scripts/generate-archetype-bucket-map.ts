// Phase 2A.1 · Generate archetype → industry_buckets[] mapping with one Sonnet call.
// Output is written to /tmp/archetype-bucket-map.json for human review BEFORE seeding.
import { writeFileSync } from 'node:fs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'
import { INDUSTRY_BUCKETS, type IndustryBucket } from '@/lib/industry-buckets'

interface Archetype {
  id: string
  name: string
  category: string
  description: string | null
  trigger_keywords: string[]
}

interface LLMBucketEntry {
  bucket: IndustryBucket
  weight: number
  reason: string
}

interface LLMMapping {
  archetype_id: string
  buckets: LLMBucketEntry[]
  notes?: string
}

interface LLMResponse {
  mappings: LLMMapping[]
}

const SYSTEM_PROMPT = `You map thematic-investing archetypes to a fixed industry-bucket taxonomy.

# Industry bucket taxonomy
Each bucket has a stable ID (path style) and a display label. You MUST only use bucket IDs from this list:

${Object.entries(INDUSTRY_BUCKETS).map(([id, label]) => `- ${id}  →  ${label}`).join('\n')}

# Mapping rules — THINK IN 3 TIERS

For every archetype, you MUST think in three tiers and include buckets from all relevant tiers:

- **Tier 1 — Direct beneficiaries (weight 1.0)**: companies whose core business *is* this theme.
- **Tier 2 — Supply chain (weight 0.7–0.9)**: suppliers, customers, service providers, equipment makers, infrastructure for Tier 1.
- **Tier 3 — Second-order / derived demand (weight 0.4–0.6)**: infrastructure enabling the boom, derived consumer/industrial demand, financing rails.

**Minimum 4 buckets per archetype** (target 5–10). Narrow event archetypes may have 4; broad super-cycle archetypes can hit 8–10. Going below 4 means you missed Tier 2/3.

## Weight discipline
- 1.0 = Tier 1 core (direct first-order)
- 0.7–0.9 = Tier 2 supply chain
- 0.4–0.6 = Tier 3 second-order
- **Cap weight 1.0 to ≤ 4 buckets per archetype** — otherwise the ranking loses signal.
- Reason: one short English sentence per bucket, naming the kind of company in that bucket that benefits.

## Self-check before emitting an archetype
For every archetype, BEFORE writing its mapping, mentally ask: *"If I retrieve only via these buckets, what landmark tickers do I miss?"*

You MUST cover these landmark tickers via your bucket selection:
- **AI Capex / AI infrastructure**: NVDA, AMD, AVGO (semis) · MSFT, GOOGL, AMZN (cloud hyperscalers) · VST, CEG, NRG (utilities/power) · VRT, ETN (electrical/cooling) · CRWD, PANW (software security on AI workloads) · ANET, SMCI (hardware)
  → must include: tech/semiconductors, tech/cloud, tech/hardware, utilities/power, industrials/electrical, tech/software
- **Middle East / oil shock / energy crisis**: XOM, CVX, OXY (oil_gas) · HAL, SLB, BKR (services) · STNG, FRO (shipping) · LNG, CQP (lng) · VLO, MPC (refining)
  → must include: energy/oil_gas, energy/services, energy/shipping, energy/lng, energy/refining
- **Defense buildup / military**: LMT, NOC, GD, RTX, HII (defense primes) · BA, GE, HEI (aerospace) · KTOS, AVAV (drones) · supply chain — semis (semiconductors in missiles), specialty metals
  → must include: industrials/defense, industrials/aerospace, tech/semiconductors, materials/metals
- **Crypto adoption / bitcoin cycle**: COIN (exchange) · MSTR (treasury) · MARA, RIOT, CLSK (mining-as-treasury) · BLK, BX (asset_mgmt for ETF flows) · semis exposure (HUT, mining hardware demand)
  → must include: crypto/exchange, crypto/treasury, financials/asset_mgmt; consider tech/semiconductors for mining hardware
- **Biotech / pharma cycle (GLP-1, gene therapy, etc.)**: LLY, NVO, PFE (pharma) · biotech pipeline names · MDT, ISRG (devices for delivery) · IQV, A (life science tools/CRO)
  → must include: healthcare/pharma, healthcare/biotech, healthcare/devices

Apply the same 3-tier discipline to every archetype, not only the ones above. The above are calibration anchors — do not under-cover comparable themes.

# Output format
Return ONLY a JSON object, no prose. Schema:
{
  "mappings": [
    {
      "archetype_id": "<exact id from input>",
      "buckets": [
        { "bucket": "<bucket id>", "weight": 1.0, "reason": "..." },
        ...
      ],
      "notes": "<optional · 1 sentence on edge cases or assumptions>"
    },
    ...
  ]
}

Every input archetype MUST appear in mappings exactly once. Return all 63 in a single response.`

async function fetchArchetypes(): Promise<Archetype[]> {
  const { data, error } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, category, description, trigger_keywords')
    .eq('is_active', true)
    .order('id')
  if (error) throw new Error(error.message)
  return (data ?? []) as Archetype[]
}

function buildUserMessage(archetypes: Archetype[]): string {
  const lines = ['# Archetypes to map']
  for (const a of archetypes) {
    lines.push('')
    lines.push(`## ${a.id}`)
    lines.push(`name: ${a.name}`)
    lines.push(`category: ${a.category}`)
    lines.push(`description: ${a.description ?? '(none)'}`)
    lines.push(`trigger_keywords: ${(a.trigger_keywords ?? []).join(' · ')}`)
  }
  return lines.join('\n')
}

function extractJson(text: string): LLMResponse {
  // Strip code fences if present.
  let s = text.trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('no JSON object in response')
  return JSON.parse(s.slice(first, last + 1)) as LLMResponse
}

async function main() {
  const archetypes = await fetchArchetypes()
  console.log(`[in] ${archetypes.length} active archetypes`)

  const userMessage = buildUserMessage(archetypes)

  console.log('[llm] calling Sonnet (streaming, all 63 archetypes)…')
  const t0 = Date.now()
  const stream = anthropic.messages.stream({
    model: MODEL_SONNET,
    max_tokens: 32000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
  })
  const res = await stream.finalMessage()
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  const usage = res.usage
  console.log(`[llm] done in ${elapsed}s · in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} cache_create=${usage.cache_creation_input_tokens ?? 0}`)

  const text = res.content
    .filter(b => b.type === 'text')
    .map(b => (b as { text: string }).text)
    .join('\n')
  const parsed = extractJson(text)

  // Validate
  const inputIds = new Set(archetypes.map(a => a.id))
  const seenIds = new Set<string>()
  const validBuckets = new Set(Object.keys(INDUSTRY_BUCKETS))
  const issues: string[] = []

  for (const m of parsed.mappings) {
    if (!inputIds.has(m.archetype_id)) {
      issues.push(`unknown archetype id: ${m.archetype_id}`)
      continue
    }
    if (seenIds.has(m.archetype_id)) issues.push(`duplicate archetype: ${m.archetype_id}`)
    seenIds.add(m.archetype_id)
    if (!Array.isArray(m.buckets) || m.buckets.length === 0) {
      issues.push(`${m.archetype_id}: no buckets`)
      continue
    }
    for (const b of m.buckets) {
      if (!validBuckets.has(b.bucket)) issues.push(`${m.archetype_id}: invalid bucket "${b.bucket}"`)
      if (typeof b.weight !== 'number' || b.weight < 0 || b.weight > 1) issues.push(`${m.archetype_id}/${b.bucket}: bad weight ${b.weight}`)
    }
  }
  for (const id of inputIds) if (!seenIds.has(id)) issues.push(`missing archetype in output: ${id}`)

  // Build name lookup
  const nameById = new Map(archetypes.map(a => [a.id, a.name]))
  const enriched = parsed.mappings.map(m => ({
    archetype_id: m.archetype_id,
    archetype_name: nameById.get(m.archetype_id) ?? m.archetype_id,
    buckets: m.buckets,
    notes: m.notes ?? null,
  }))

  writeFileSync('/tmp/archetype-bucket-map-v2.json', JSON.stringify({
    generated_at: new Date().toISOString(),
    archetype_count: archetypes.length,
    mapping_count: enriched.length,
    issues,
    mappings: enriched,
  }, null, 2))

  console.log(`\nwritten: /tmp/archetype-bucket-map-v2.json`)
  console.log(`mappings: ${enriched.length} · issues: ${issues.length}`)

  if (issues.length > 0) {
    console.log('\n=== ISSUES ===')
    for (const i of issues) console.log('  ' + i)
  }

  // Compact human preview
  console.log('\n=== Mappings (compact preview) ===')
  for (const m of enriched) {
    const summary = m.buckets
      .map(b => `${b.bucket}@${b.weight.toFixed(1)}`)
      .join(' · ')
    console.log(`  ${m.archetype_id.padEnd(40)} ${summary}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
