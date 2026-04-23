import { config } from 'dotenv'
config({ path: '.env.localc' })

interface ArchetypeConfig {
  archetype_id: string
  tickers: string[]
  keywords: string[]
  target_count: number
}

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

const ARCHETYPE_CONFIGS: ArchetypeConfig[] = [
  {
    archetype_id: 'hyperscaler_mega_capex',
    tickers: ['GOOGL', 'MSFT', 'META', 'AMZN', 'ORCL'],
    keywords: ['capital expenditure', 'capex guidance', 'data center spending', 'data center investment', 'infrastructure spending', 'AI infrastructure spend', 'billion capex', 'billion in data center'],
    target_count: 12,
  },
  {
    archetype_id: 'nvda_avgo_strategic_investment',
    tickers: ['NVDA', 'AVGO'],
    keywords: ['strategic investment', 'equity stake', 'invests in', 'supply agreement', 'multi-year deal', 'acquires stake', 'partnership deal', 'joint venture'],
    target_count: 12,
  },
  {
    archetype_id: 'cpo_photonics_rotation',
    tickers: ['COHR', 'LITE', 'AAOI', 'FN', 'POET'],
    keywords: ['optic', 'photonic', 'transceiver', 'interconnect', 'co-packaged', '800G', '1.6T', 'silicon photonics'],
    target_count: 10,
  },
  {
    archetype_id: 'middle_east_energy_shock',
    tickers: ['CVX', 'XOM', 'OXY', 'LNG', 'SLB'],
    keywords: ['Iran', 'Hormuz', 'Houthi', 'tanker', 'attack', 'sanction', 'oil supply', 'energy crisis'],
    target_count: 10,
  },
  {
    archetype_id: 'us_china_tariff_escalation',
    tickers: ['NVDA', 'AMD', 'INTC', 'AMAT', 'LRCX', 'MU'],
    keywords: ['tariff', 'export control', 'entity list', 'chip ban', 'China restriction', 'semiconductor sanction'],
    target_count: 10,
  },
  {
    archetype_id: 'semi_fab_disruption',
    tickers: ['TSM', 'INTC', 'GFS', 'MU', 'AMAT'],
    keywords: ['fab shutdown', 'production halt', 'chip shortage', 'wafer', 'supply disruption', 'earthquake', 'outage'],
    target_count: 8,
  },
  {
    archetype_id: 'fed_dovish_pivot',
    tickers: ['XBI', 'IBB', 'O', 'DHI', 'LEN'],
    keywords: ['rate cut', 'Fed pivot', 'dovish', 'Powell', 'FOMC', 'interest rate cut', 'easing'],
    target_count: 8,
  },
  {
    archetype_id: 'energy_transition_acceleration',
    tickers: ['VRT', 'CEG', 'VST', 'NEE', 'GEV'],
    keywords: ['nuclear', 'small modular reactor', 'SMR', 'power purchase', 'offtake', 'data center power', 'gigawatt', 'grid'],
    target_count: 10,
  },
  {
    archetype_id: 'rare_earth_national_security',
    tickers: ['MP', 'UUUU', 'AXTI'],
    keywords: ['rare earth', 'critical mineral', 'lithium', 'national security', 'China export ban', 'strategic reserve', 'mine'],
    target_count: 8,
  },
  // Step 6 new archetypes
  {
    archetype_id: 'agriculture_supply_shock',
    tickers: ['NTR', 'MOS', 'CF', 'ADM', 'BG', 'DE', 'CTVA', 'FMC'],
    keywords: ['fertilizer', 'potash', 'phosphate', 'nitrogen', 'grain supply', 'crop yield', 'agri-commodity'],
    target_count: 10,
  },
  {
    archetype_id: 'obesity_drug_breakthrough',
    tickers: ['LLY', 'NVO', 'VKTX', 'MRK', 'AMGN', 'PFE', 'REGN'],
    keywords: ['GLP-1', 'obesity drug', 'Wegovy', 'Zepbound', 'Mounjaro', 'weight loss', 'semaglutide', 'tirzepatide'],
    target_count: 10,
  },
  {
    archetype_id: 'defense_buildup',
    tickers: ['LMT', 'RTX', 'NOC', 'GD', 'LHX', 'HII', 'KTOS', 'LDOS'],
    keywords: ['defense budget', 'military contract', 'Patriot missile', 'F-35', 'arms deal', 'defense procurement', 'foreign military sale'],
    target_count: 10,
  },
  {
    archetype_id: 'ev_supply_chain_shift',
    tickers: ['ALB', 'SQM', 'LTHM', 'F', 'GM', 'RIVN', 'LCID', 'TSLA'],
    keywords: ['EV battery', 'lithium supply', 'cathode material', 'EV tariff', 'Chinese EV', 'battery manufacturing', 'charging infrastructure'],
    target_count: 10,
  },
  {
    archetype_id: 'crypto_institutional_adoption',
    tickers: ['COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'HOOD', 'SQ', 'IBIT'],
    keywords: ['Bitcoin ETF', 'crypto regulation', 'stablecoin', 'institutional crypto', 'BTC treasury', 'digital asset', 'SEC crypto approval'],
    target_count: 10,
  },
  {
    archetype_id: 'consumer_polarization',
    tickers: ['LVMUY', 'RH', 'DLTR', 'DG', 'CMG', 'TJX', 'WMT', 'COST', 'TGT'],
    keywords: ['luxury demand', 'dollar store', 'discount retail', 'premium pricing', 'trade-down behavior', 'consumer spending divergence', 'K-shaped consumer'],
    target_count: 8,
  },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseAdmin: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let anthropic: any
let MODEL_SONNET: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getStockNewsMultiTicker: any

interface ArchetypeRow {
  name: string
  description: string | null
  trigger_keywords: unknown
  exclusion_rules: unknown
}

interface ScoreEntry {
  index: number
  score: number
  reason: string
}

interface ArchetypeResult {
  archetype: string
  candidates: number
  selected: number
  deduped: number
  inserted: number
  skipped: number
  error?: string
  sonnet_input_tokens?: number
  sonnet_output_tokens?: number
}

async function filterWithSonnet(
  candidates: CandidateItem[],
  archetype: ArchetypeRow
): Promise<{ items: CandidateItem[]; input_tokens: number; output_tokens: number }> {
  if (candidates.length === 0) return { items: [], input_tokens: 0, output_tokens: 0 }

  const toScore = candidates.slice(0, 60)

  const scoringPrompt = `You filter news for a specific investment archetype.

ARCHETYPE: ${archetype.name}
DESCRIPTION: ${archetype.description ?? ''}
TRIGGER KEYWORDS: ${(archetype.trigger_keywords as string[]).join(', ')}
EXCLUSION RULES:
${((archetype.exclusion_rules as string[]) || []).map((r: string) => '- ' + r).join('\n')}

For each news item, score 0-10:
- 10: Perfect match, single hard event with date/amount/parties
- 7-9: Strong match
- 4-6: Marginal (analysis with some event content)
- 0-3: Reject (pure opinion/analysis/off-topic/violates exclusion)

Return JSON array ONLY, no other text:
[{"index": 0, "score": 8, "reason": "..."}, ...]

NEWS:
${toScore.map((c, i) =>
    `[${i}] ${c.publishedDate?.split('T')[0]} | ${c.title}\n     ${(c.text ?? '').slice(0, 200)}`
  ).join('\n\n')}`

  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 4500,
    messages: [{ role: 'user', content: scoringPrompt }],
  })

  const input_tokens = response.usage.input_tokens
  const output_tokens = response.usage.output_tokens
  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  let cleanedResponse = rawText.trim()
  if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim()
  }
  const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/)

  if (!jsonMatch) {
    console.log(`  Sonnet response parsing failed`)
    console.log('  Raw:', cleanedResponse.slice(0, 300))
    return { items: [], input_tokens, output_tokens }
  }

  try {
    const scores: ScoreEntry[] = JSON.parse(jsonMatch[0])
    const items = scores
      .filter((s) => s.score >= 7)
      .sort((a, b) => b.score - a.score)
      .map((s) => ({ ...toScore[s.index], _score: s.score, _reason: s.reason }))
    return { items, input_tokens, output_tokens }
  } catch {
    return { items: [], input_tokens, output_tokens }
  }
}

function eventGroupKey(item: CandidateItem): string {
  const date = new Date(item.publishedDate ?? '')
  const jan4 = new Date(date.getFullYear(), 0, 4)
  const week = Math.ceil(((date.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7)

  const title = (item.title ?? '').toLowerCase()
  const companyMarkers = [
    'alphabet', 'google', 'amazon', 'aws',
    'microsoft', 'azure', 'meta', 'oracle',
    'nvidia', 'broadcom', 'apple', 'tesla',
    'iran', 'opec', 'china', 'fed', 'powell',
    'tsmc', 'intel', 'amd', 'samsung',
  ]
  const matched = companyMarkers.filter((c) => title.includes(c)).sort().slice(0, 2).join('-')
  const fallback = matched || title.replace(/[^a-z0-9]/g, '').slice(0, 15)

  return `${date.getFullYear()}-W${week}|${fallback}`
}

async function backfillArchetype(cfg: ArchetypeConfig, dryRun: boolean): Promise<ArchetypeResult> {
  console.log(`\n=== ${cfg.archetype_id} ===`)

  const candidates = await getStockNewsMultiTicker(cfg.tickers, 300, 30, cfg.keywords)
  console.log(`  Found ${candidates.length} candidates`)

  if (candidates.length === 0) {
    return { archetype: cfg.archetype_id, candidates: 0, selected: 0, deduped: 0, inserted: 0, skipped: 0 }
  }

  const { data: archetype } = await supabaseAdmin
    .from('theme_archetypes')
    .select('name, description, trigger_keywords, exclusion_rules')
    .eq('id', cfg.archetype_id)
    .single()

  if (!archetype) {
    console.log(`  Archetype ${cfg.archetype_id} not found in DB, skipping`)
    return { archetype: cfg.archetype_id, candidates: candidates.length, selected: 0, deduped: 0, inserted: 0, skipped: 0 }
  }

  const { items: scored, input_tokens, output_tokens } = await filterWithSonnet(
    candidates as CandidateItem[],
    archetype as ArchetypeRow
  )
  const selected = scored.slice(0, cfg.target_count)

  console.log(`  Sonnet selected ${selected.length} (score >= 7):`)
  selected.forEach((item) => {
    console.log(`    [${item._score}] ${item.publishedDate?.split('T')[0]} · ${item.title}`)
    console.log(`           source: ${item.publisher ?? item.site}`)
  })

  // Date distribution (on selected, before dedup)
  console.log('  Date distribution:')
  const dateMap = new Map<string, number>()
  for (const item of selected) {
    const month = item.publishedDate?.split('T')[0]?.slice(0, 7) ?? 'unknown'
    dateMap.set(month, (dateMap.get(month) ?? 0) + 1)
  }
  for (const [month, count] of Array.from(dateMap.entries()).sort()) {
    console.log(`    ${month}: ${count}`)
  }

  // Same-event dedup
  const groups = new Map<string, CandidateItem>()
  for (const item of selected) {
    const key = eventGroupKey(item)
    const existing = groups.get(key)
    if (!existing || (item._score ?? 0) > (existing._score ?? 0)) {
      groups.set(key, item)
    } else {
      console.log(`    DEDUP: ${item.title?.slice(0, 70)}`)
    }
  }
  const deduped = Array.from(groups.values()).sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
  console.log(`  After dedup: ${deduped.length} unique events (${selected.length - deduped.length} removed)`)

  if (dryRun) {
    console.log(`  [DRY RUN] Would insert ${deduped.length} events`)
    return {
      archetype: cfg.archetype_id,
      candidates: candidates.length,
      selected: selected.length,
      deduped: deduped.length,
      inserted: 0,
      skipped: 0,
      sonnet_input_tokens: input_tokens,
      sonnet_output_tokens: output_tokens,
    }
  }

  let inserted = 0
  let skipped = 0

  for (const item of deduped) {
    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('source_url', item.url)
      .maybeSingle()

    if (existing) {
      skipped++
      continue
    }

    const { error } = await supabaseAdmin.from('events').insert({
      event_date: item.publishedDate?.split('T')[0] ?? new Date().toISOString().split('T')[0],
      headline: item.title,
      source_url: item.url,
      source_name: `FMP Backfill · ${cfg.archetype_id}`,
      raw_content: item.text ?? item.title,
      mentioned_tickers: [],
    })

    if (error) {
      console.log(`    ERROR inserting: ${error.message}`)
    } else {
      inserted++
      console.log(`    ✓ ${item.publishedDate?.split('T')[0]} · ${item.title?.slice(0, 70)}`)
    }
  }

  console.log(`  ✅ Inserted ${inserted}, skipped ${skipped} duplicates`)

  return {
    archetype: cfg.archetype_id,
    candidates: candidates.length,
    selected: selected.length,
    deduped: deduped.length,
    inserted,
    skipped,
    sonnet_input_tokens: input_tokens,
    sonnet_output_tokens: output_tokens,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const archetypeArg = args.find((a) => a.startsWith('--archetype='))?.split('=')[1]
  const startTime = Date.now()

  // Dynamic imports after dotenv config runs
  ;({ supabaseAdmin } = await import('@/lib/supabase-admin'))
  ;({ anthropic, MODEL_SONNET } = await import('@/lib/anthropic'))
  ;({ getStockNewsMultiTicker } = await import('@/lib/fmp'))

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (archetypeArg) console.log(`Filter: archetype = ${archetypeArg}`)

  if (!process.env.FMP_API_KEY) {
    console.error('FMP_API_KEY missing from environment')
    process.exit(1)
  }

  const configs = archetypeArg
    ? ARCHETYPE_CONFIGS.filter((c) => c.archetype_id === archetypeArg)
    : ARCHETYPE_CONFIGS

  if (configs.length === 0) {
    console.error(`No config found for archetype: ${archetypeArg}`)
    process.exit(1)
  }

  const results: ArchetypeResult[] = []
  for (const cfg of configs) {
    try {
      const result = await backfillArchetype(cfg, dryRun)
      results.push(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\nError processing ${cfg.archetype_id}: ${msg}`)
      results.push({ archetype: cfg.archetype_id, candidates: 0, selected: 0, deduped: 0, inserted: 0, skipped: 0, error: msg })
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const totalInserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0)
  const totalSkipped = results.reduce((s, r) => s + (r.skipped ?? 0), 0)
  const totalInputTokens = results.reduce((s, r) => s + (r.sonnet_input_tokens ?? 0), 0)
  const totalOutputTokens = results.reduce((s, r) => s + (r.sonnet_output_tokens ?? 0), 0)
  // Sonnet pricing: $3/M input, $15/M output
  const estimatedCost = ((totalInputTokens / 1_000_000) * 3 + (totalOutputTokens / 1_000_000) * 15).toFixed(3)

  console.log('\n=== Summary ===')
  console.log(`${'Archetype'.padEnd(38)} ${'Cand'.padStart(5)} ${'Sel'.padStart(4)} ${'Dedup'.padStart(6)} ${'Insert'.padStart(7)} ${'Skip'.padStart(5)}`)
  console.log('-'.repeat(70))
  for (const r of results) {
    if (r.error) {
      console.log(`${r.archetype.padEnd(38)} ERROR: ${r.error.slice(0, 30)}`)
    } else {
      console.log(
        `${r.archetype.padEnd(38)} ${String(r.candidates).padStart(5)} ${String(r.selected).padStart(4)} ${String(r.deduped).padStart(6)} ${String(r.inserted).padStart(7)} ${String(r.skipped).padStart(5)}`
      )
    }
  }
  console.log('-'.repeat(70))
  console.log(`Total events inserted: ${totalInserted}  |  skipped: ${totalSkipped}`)
  console.log(`Sonnet tokens: ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`)
  console.log(`Estimated Sonnet cost: $${estimatedCost}`)
  console.log(`Total time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
