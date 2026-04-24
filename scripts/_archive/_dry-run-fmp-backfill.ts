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

interface ArchetypeConfig {
  archetype_id: string
  tickers: string[]
  keywords: string[]
  target_count: number
}

const CONFIGS: ArchetypeConfig[] = [
  {
    archetype_id: 'energy_transition_acceleration',
    tickers: ['VRT', 'CEG', 'VST', 'NEE', 'GEV'],
    keywords: ['nuclear', 'small modular reactor', 'SMR', 'power purchase', 'offtake', 'data center power', 'gigawatt', 'grid'],
    target_count: 15,
  },
  {
    archetype_id: 'defense_buildup',
    tickers: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII'],
    keywords: ['missile', 'munitions', 'Patriot', 'ammunition', 'defense contract', 'DoD award', 'Ukraine aid', 'Iran'],
    target_count: 15,
  },
  {
    archetype_id: 'agriculture_supply_shock',
    tickers: ['CF', 'MOS', 'NTR', 'ADM', 'DE', 'BG'],
    keywords: ['fertilizer', 'potash', 'urea', 'grain', 'wheat', 'drought', 'crop', 'harvest', 'Ukraine', 'export ban'],
    target_count: 15,
  },
]

const DAYS_BACK = 7

async function main() {
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')
  const { getStockNewsMultiTicker } = await import('../lib/fmp')
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  if (!process.env.FMP_API_KEY) {
    console.error('FMP_API_KEY missing')
    process.exit(1)
  }

  const cutoff = Date.now() - DAYS_BACK * 86400000
  console.log(`Dry-run FMP backfill · daysBack=${DAYS_BACK} · target=15 per archetype\n`)

  let grandInputTokens = 0, grandOutputTokens = 0

  for (const cfg of CONFIGS) {
    console.log(`=== ${cfg.archetype_id} ===`)
    const raw = await getStockNewsMultiTicker(cfg.tickers, 300, 30, cfg.keywords)
    const inWindow = raw.filter((n) => {
      const d = new Date(n.publishedDate).getTime()
      return Number.isFinite(d) && d >= cutoff
    })
    console.log(`  FMP raw:         ${raw.length} items across tickers`)
    console.log(`  in 7-day window: ${inWindow.length}`)
    if (inWindow.length === 0) {
      console.log(`  (nothing to score)\n`)
      continue
    }

    // Sonnet filter using same prompt shape as backfill-from-fmp.ts
    const { data: arch } = await supabaseAdmin
      .from('theme_archetypes')
      .select('name, description, trigger_keywords, exclusion_rules')
      .eq('id', cfg.archetype_id)
      .single()

    if (!arch) {
      console.log(`  archetype ${cfg.archetype_id} not in DB · skip\n`)
      continue
    }

    const toScore = (inWindow as CandidateItem[]).slice(0, 60)

    const prompt = `You filter news for a specific investment archetype.

ARCHETYPE: ${arch.name}
DESCRIPTION: ${arch.description ?? ''}
TRIGGER KEYWORDS: ${(arch.trigger_keywords as string[]).join(', ')}
EXCLUSION RULES:
${((arch.exclusion_rules as string[]) || []).map((r) => '- ' + r).join('\n')}

For each news item, score 0-10:
- 10: Perfect match, single hard event with date/amount/parties
- 7-9: Strong match
- 4-6: Marginal
- 0-3: Reject

Return JSON array ONLY:
[{"index": 0, "score": 8, "reason": "..."}, ...]

NEWS:
${toScore.map((c, i) => `[${i}] ${c.publishedDate?.split('T')[0]} | ${c.title}\n     ${(c.text ?? '').slice(0, 200)}`).join('\n\n')}`

    const resp = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 4500,
      messages: [{ role: 'user', content: prompt }],
    })
    grandInputTokens += resp.usage.input_tokens
    grandOutputTokens += resp.usage.output_tokens

    const raw_text = resp.content[0].type === 'text' ? resp.content[0].text : ''
    const cleaned = raw_text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    const m = cleaned.match(/\[[\s\S]*\]/)
    if (!m) {
      console.log(`  Sonnet parse failed\n`)
      continue
    }
    const scores: Array<{ index: number; score: number; reason: string }> = JSON.parse(m[0])
    const passing = scores.filter((s) => s.score >= 7).sort((a, b) => b.score - a.score).slice(0, cfg.target_count)

    console.log(`  Sonnet scored:   ${scores.length} (tokens in=${resp.usage.input_tokens} out=${resp.usage.output_tokens})`)
    console.log(`  score >= 7:      ${passing.length}`)
    console.log(`  Top ${Math.min(5, passing.length)} samples:`)
    for (const s of passing.slice(0, 5)) {
      const item = toScore[s.index]
      console.log(`    [${s.score}] ${item.publishedDate?.split('T')[0]} · ${item.title?.slice(0, 75)}`)
      console.log(`          ${s.reason.slice(0, 110)}`)
    }
    console.log('')
  }

  const cost = ((grandInputTokens / 1_000_000) * 3 + (grandOutputTokens / 1_000_000) * 15).toFixed(3)
  console.log(`=== Cost (3 archetypes, 7-day window) ===`)
  console.log(`Sonnet: ${grandInputTokens.toLocaleString()} in / ${grandOutputTokens.toLocaleString()} out · $${cost}`)
  console.log(`Extrapolated to 62 archetypes, 90-day window: $${(parseFloat(cost) * (62 / 3) * (90 / 7)).toFixed(2)} (upper bound)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
