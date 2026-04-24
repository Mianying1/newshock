import { config } from 'dotenv'
config({ path: '.env.local' })

interface CandidateItem {
  symbol: string | null
  publishedDate: string
  title: string
  text: string
  url: string
  site: string
  publisher?: string
  _score?: number
  _reason?: string
}

interface ArchetypeRow {
  id: string
  name: string
  description: string | null
  trigger_keywords: string[]
  exclusion_rules: string[] | null
  // Either tier dict OR flat array — archetype data is heterogeneous
  typical_tickers:
    | { tier1?: string[]; tier2?: string[]; tier3?: string[]; dynamic?: boolean }
    | string[]
    | null
}

function extractTickers(t: ArchetypeRow['typical_tickers']): string[] {
  if (!t) return []
  if (Array.isArray(t)) return t.filter((s): s is string => typeof s === 'string')
  return [...(t.tier1 ?? []), ...(t.tier2 ?? [])]
}

interface ScoreEntry { index: number; score: number; reason: string }

// Day 5 · 9 archetypes with per-archetype targets (top-up vs full)
const ARCHETYPE_CONFIGS: Array<{
  id: string
  target: number            // exact top-up count (15 - existing)
  manual_seed_tickers?: string[]  // override DB tier1+2 (used when DB has no tickers)
}> = [
  { id: 'defense_buildup',                  target: 8  },
  { id: 'agriculture_supply_shock',         target: 5  },
  { id: 'ai_datacenter_power_demand',       target: 15,
    manual_seed_tickers: ['VRT', 'CEG', 'VST', 'NEE', 'GEV', 'TLN', 'CCJ', 'SMR', 'BE', 'NRG'] },
  { id: 'ai_capex_infrastructure',          target: 15 },
  { id: 'obesity_drug_breakthrough',        target: 5  },
  { id: 'pharma_innovation_super_cycle',    target: 15 },
  { id: 'middle_east_energy_shock',         target: 5  },
  { id: 'cpo_photonics_rotation',           target: 15 },
  { id: 'rare_earth_national_security',     target: 8  },
]

function eventGroupKey(title: string, publishedDate: string): string {
  // title first 80 chars lowercased + date-day
  return (title ?? '').slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim() + '|' + (publishedDate ?? '').slice(0, 10)
}

async function main() {
  const startAll = Date.now()
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../../lib/anthropic')
  const { getStockNewsMultiTicker } = await import('../../lib/fmp')

  console.log(`Day 5 FMP backfill · DRY-RUN · 9 archetypes\n`)

  // Build existing-event dedup set (all FMP Backfill rows — one pass)
  const { data: existingAll } = await supabaseAdmin
    .from('events')
    .select('headline, event_date, source_url, source_name')
    .or(
      `source_name.ilike.FMP Backfill%,source_name.eq.SEC EDGAR 8-K Filings`
    )
  const existingKeys = new Set<string>()
  const existingUrls = new Set<string>()
  const existingCountByArch: Record<string, number> = {}
  for (const e of existingAll ?? []) {
    const date = (e.event_date ?? '').slice(0, 10)
    if (e.headline) existingKeys.add(eventGroupKey(e.headline, date))
    if (e.source_url) existingUrls.add(e.source_url as string)
    const sn = e.source_name ?? ''
    const m = sn.match(/FMP Backfill · (.+)/)
    if (m) existingCountByArch[m[1]] = (existingCountByArch[m[1]] ?? 0) + 1
  }
  console.log(`existing dedup corpus: ${existingAll?.length ?? 0} rows · ${existingKeys.size} unique keys · ${existingUrls.size} urls\n`)

  interface Result {
    id: string; existing: number; target: number
    tickers: number; raw: number; filtered: number; dedup_after: number; would_insert: number
    in_tok: number; out_tok: number; fetch_s: number
    sample: { score: number; date: string; symbol: string; title: string }[]
  }
  const results: Result[] = []
  let totalIn = 0, totalOut = 0

  for (const cfg of ARCHETYPE_CONFIGS) {
    console.log(`=== ${cfg.id} ===`)
    const { data: arc } = await supabaseAdmin
      .from('theme_archetypes')
      .select('id, name, description, trigger_keywords, exclusion_rules, typical_tickers')
      .eq('id', cfg.id)
      .single()
    if (!arc) { console.log(`  NOT FOUND\n`); continue }
    const a = arc as ArchetypeRow
    const existing = existingCountByArch[cfg.id] ?? 0
    console.log(`  existing FMP Backfill events: ${existing} · target top-up: ${cfg.target}`)

    // Resolve tickers
    let tickers: string[] = []
    if (cfg.manual_seed_tickers && cfg.manual_seed_tickers.length > 0) {
      tickers = cfg.manual_seed_tickers
      console.log(`  ticker source: MANUAL · ${tickers.length}: ${tickers.join(',')}`)
    } else {
      tickers = extractTickers(a.typical_tickers)
      console.log(`  ticker source: DB · ${tickers.length}: ${tickers.join(',')}`)
    }
    if (tickers.length === 0) {
      console.log(`  SKIP · no tickers\n`)
      continue
    }

    const fetchStart = Date.now()
    let candidates: CandidateItem[] = []
    try {
      candidates = (await getStockNewsMultiTicker(tickers, 300, 60, a.trigger_keywords)) as CandidateItem[]
    } catch (e) {
      console.log(`  FETCH ERROR: ${(e as Error).message}\n`)
      continue
    }
    const fetch_s = (Date.now() - fetchStart) / 1000
    console.log(`  raw candidates: ${candidates.length} · fetch ${fetch_s.toFixed(1)}s`)
    if (candidates.length === 0) {
      results.push({ id: cfg.id, existing, target: cfg.target, tickers: tickers.length, raw: 0, filtered: 0, dedup_after: 0, would_insert: 0, in_tok: 0, out_tok: 0, fetch_s, sample: [] })
      console.log(``)
      continue
    }

    // Dedup vs existing (title+date or URL)
    const beforeDedup = candidates.length
    candidates = candidates.filter((c) => {
      if (existingUrls.has(c.url)) return false
      const k = eventGroupKey(c.title ?? '', c.publishedDate ?? '')
      if (existingKeys.has(k)) return false
      return true
    })
    console.log(`  after dedup vs existing: ${candidates.length} (dropped ${beforeDedup - candidates.length})`)

    if (cfg.target === 0) {
      console.log(`  target=0 · skipping Sonnet\n`)
      results.push({ id: cfg.id, existing, target: 0, tickers: tickers.length, raw: beforeDedup, filtered: 0, dedup_after: candidates.length, would_insert: 0, in_tok: 0, out_tok: 0, fetch_s, sample: [] })
      continue
    }

    // Sonnet filter (top 60)
    const toScore = candidates.slice(0, 60)
    const prompt = `You filter news for a specific investment archetype.

ARCHETYPE: ${a.name}
DESCRIPTION: ${a.description ?? ''}
TRIGGER KEYWORDS: ${a.trigger_keywords.join(', ')}
EXCLUSION RULES:
${(a.exclusion_rules ?? []).map((r) => '- ' + r).join('\n')}

For each news item, score 0-10:
- 10: Perfect match, single hard event with date/amount/parties
- 7-9: Strong match
- 4-6: Marginal (analysis with some event content)
- 0-3: Reject (pure opinion/analysis/off-topic/violates exclusion)

Return JSON array ONLY, no other text:
[{"index": 0, "score": 8, "reason": "..."}, ...]

NEWS:
${toScore.map((c, i) =>
  `[${i}] ${c.publishedDate?.split('T')[0]} | ${c.symbol ?? '-'} | ${c.title}\n     ${(c.text ?? '').slice(0, 200)}`
).join('\n\n')}`

    const resp = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 4500,
      messages: [{ role: 'user', content: prompt }],
    })
    const inTok = resp.usage.input_tokens
    const outTok = resp.usage.output_tokens
    totalIn += inTok
    totalOut += outTok

    const rawText = resp.content[0].type === 'text' ? resp.content[0].text : ''
    let cleaned = rawText.trim()
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    const mJson = cleaned.match(/\[[\s\S]*\]/)
    let scored: CandidateItem[] = []
    if (mJson) {
      try {
        const scores: ScoreEntry[] = JSON.parse(mJson[0])
        scored = scores
          .filter((s) => s.score >= 7)
          .sort((a, b) => b.score - a.score)
          .map((s) => ({ ...toScore[s.index], _score: s.score, _reason: s.reason }))
      } catch {
        console.log(`  Sonnet parse fail`)
      }
    }
    console.log(`  Sonnet: in=${inTok} out=${outTok} · score>=7: ${scored.length}`)

    // Same-event dedup within batch (title+date)
    const seenBatch = new Set<string>()
    const dedupBatch: CandidateItem[] = []
    for (const s of scored) {
      const k = eventGroupKey(s.title ?? '', s.publishedDate ?? '')
      if (seenBatch.has(k)) continue
      seenBatch.add(k)
      dedupBatch.push(s)
    }
    const selected = dedupBatch.slice(0, cfg.target)
    console.log(`  selected top ${cfg.target}: ${selected.length} (within-batch dedup dropped ${scored.length - dedupBatch.length})`)

    const sample = selected.map((s) => ({
      score: s._score ?? 0,
      date: (s.publishedDate ?? '').slice(0, 10),
      symbol: s.symbol ?? '-',
      title: s.title ?? '',
    }))
    for (const s of selected.slice(0, 5)) {
      console.log(`    [${s._score}] ${s.publishedDate?.split('T')[0]} · ${(s.symbol ?? '-').padEnd(6)} · ${s.title?.slice(0, 80)}`)
    }

    results.push({
      id: cfg.id, existing, target: cfg.target, tickers: tickers.length,
      raw: beforeDedup, filtered: scored.length, dedup_after: dedupBatch.length, would_insert: selected.length,
      in_tok: inTok, out_tok: outTok, fetch_s, sample,
    })
    console.log(``)
  }

  // Summary
  const totalTime = ((Date.now() - startAll) / 1000).toFixed(0)
  const cost = (totalIn / 1_000_000) * 3 + (totalOut / 1_000_000) * 15

  console.log(`=== Summary ===`)
  console.log(`${'archetype'.padEnd(38)} ${'exist'.padStart(5)} ${'tgt'.padStart(4)} ${'tk'.padStart(3)} ${'raw'.padStart(5)} ${'filt'.padStart(5)} ${'dedup'.padStart(5)} ${'WOULD'.padStart(6)} ${'$cost'.padStart(7)}`)
  console.log('-'.repeat(90))
  let totInsert = 0
  for (const r of results) {
    const rcost = (r.in_tok / 1_000_000) * 3 + (r.out_tok / 1_000_000) * 15
    totInsert += r.would_insert
    console.log(
      `${r.id.padEnd(38)} ${String(r.existing).padStart(5)} ${String(r.target).padStart(4)} ${String(r.tickers).padStart(3)} ${String(r.raw).padStart(5)} ${String(r.filtered).padStart(5)} ${String(r.dedup_after).padStart(5)} ${String(r.would_insert).padStart(6)} ${('$' + rcost.toFixed(3)).padStart(7)}`
    )
  }
  console.log('-'.repeat(90))
  console.log(`TOTAL would_insert: ${totInsert}  (target was 89)`)
  console.log(`Sonnet total: ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out · $${cost.toFixed(3)}`)
  console.log(`Elapsed: ${totalTime}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
