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

const ARCHETYPE_CONFIGS: Array<{
  id: string
  target: number
  manual_seed_tickers?: string[]
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
  return (title ?? '').slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim() + '|' + (publishedDate ?? '').slice(0, 10)
}

async function main() {
  const startAll = Date.now()
  const { supabaseAdmin } = await import('../../lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('../../lib/anthropic')
  const { getStockNewsMultiTicker } = await import('../../lib/fmp')

  console.log(`Day 5 FMP backfill · LIVE · 9 archetypes\n`)

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
    tickers: number; raw: number; filtered: number; dedup_after: number; inserted: number; skipped: number
    in_tok: number; out_tok: number; fetch_s: number
  }
  const results: Result[] = []
  let totalIn = 0, totalOut = 0
  let totalInserted = 0

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
      console.error(`  FETCH ERROR: ${(e as Error).message}`)
      process.exit(1)
    }
    const fetch_s = (Date.now() - fetchStart) / 1000
    console.log(`  raw candidates: ${candidates.length} · fetch ${fetch_s.toFixed(1)}s`)
    if (candidates.length === 0) {
      results.push({ id: cfg.id, existing, target: cfg.target, tickers: tickers.length, raw: 0, filtered: 0, dedup_after: 0, inserted: 0, skipped: 0, in_tok: 0, out_tok: 0, fetch_s })
      console.log(``)
      continue
    }

    const beforeDedup = candidates.length
    candidates = candidates.filter((c) => {
      if (existingUrls.has(c.url)) return false
      const k = eventGroupKey(c.title ?? '', c.publishedDate ?? '')
      if (existingKeys.has(k)) return false
      return true
    })
    console.log(`  after dedup vs existing: ${candidates.length} (dropped ${beforeDedup - candidates.length})`)

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
    if (!mJson) {
      console.error(`  Sonnet parse fail · stop`)
      process.exit(1)
    }
    try {
      const scores: ScoreEntry[] = JSON.parse(mJson[0])
      scored = scores
        .filter((s) => s.score >= 7)
        .sort((a, b) => b.score - a.score)
        .map((s) => ({ ...toScore[s.index], _score: s.score, _reason: s.reason }))
    } catch (e) {
      console.error(`  Sonnet JSON parse error: ${(e as Error).message} · stop`)
      process.exit(1)
    }
    console.log(`  Sonnet: in=${inTok} out=${outTok} · score>=7: ${scored.length}`)

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

    let inserted = 0
    let skipped = 0
    for (const item of selected) {
      if (existingUrls.has(item.url)) { skipped++; continue }
      const k = eventGroupKey(item.title ?? '', item.publishedDate ?? '')
      if (existingKeys.has(k)) { skipped++; continue }

      const { error } = await supabaseAdmin.from('events').insert({
        event_date: (item.publishedDate ?? '').split('T')[0] || new Date().toISOString().split('T')[0],
        headline: item.title,
        source_url: item.url,
        source_name: `FMP Backfill · ${cfg.id}`,
        raw_content: item.text ?? item.title,
        mentioned_tickers: [],
        trigger_theme_id: null,
      })

      if (error) {
        console.error(`    INSERT ERROR: ${error.message} · stop`)
        process.exit(1)
      }
      inserted++
      existingUrls.add(item.url)
      existingKeys.add(k)
    }
    totalInserted += inserted
    console.log(`  ✓ inserted ${inserted} · skipped ${skipped}\n`)

    results.push({
      id: cfg.id, existing, target: cfg.target, tickers: tickers.length,
      raw: beforeDedup, filtered: scored.length, dedup_after: dedupBatch.length, inserted, skipped,
      in_tok: inTok, out_tok: outTok, fetch_s,
    })
  }

  const totalTime = ((Date.now() - startAll) / 1000).toFixed(0)
  const cost = (totalIn / 1_000_000) * 3 + (totalOut / 1_000_000) * 15

  console.log(`=== Summary ===`)
  console.log(`${'archetype'.padEnd(38)} ${'exist'.padStart(5)} ${'tgt'.padStart(4)} ${'tk'.padStart(3)} ${'raw'.padStart(5)} ${'filt'.padStart(5)} ${'INS'.padStart(4)} ${'skp'.padStart(4)} ${'$cost'.padStart(7)}`)
  console.log('-'.repeat(90))
  for (const r of results) {
    const rcost = (r.in_tok / 1_000_000) * 3 + (r.out_tok / 1_000_000) * 15
    console.log(
      `${r.id.padEnd(38)} ${String(r.existing).padStart(5)} ${String(r.target).padStart(4)} ${String(r.tickers).padStart(3)} ${String(r.raw).padStart(5)} ${String(r.filtered).padStart(5)} ${String(r.inserted).padStart(4)} ${String(r.skipped).padStart(4)} ${('$' + rcost.toFixed(3)).padStart(7)}`
    )
  }
  console.log('-'.repeat(90))
  console.log(`TOTAL inserted: ${totalInserted}`)
  console.log(`Sonnet total: ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out · $${cost.toFixed(3)}`)
  console.log(`Elapsed: ${totalTime}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
