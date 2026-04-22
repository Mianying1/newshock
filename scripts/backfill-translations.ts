import { config } from 'dotenv'
config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 8
const CONCURRENCY = 2

interface TranslationJob {
  id: string
  table: string
  payload: Record<string, unknown>
  updateFields: string[]
}

const SYSTEM_PROMPT = `You are a professional translator specializing in US equity research and thematic investing.

Translate EVERY English string value in the given JSON into Simplified Chinese, unless the item explicitly looks like a code/identifier (snake_case words, 3-letter tickers, dates, URLs, CIK numbers).

Rules:
- Preserve JSON structure exactly. Never translate keys.
- Translate narrative prose fully: names, titles, summaries, descriptions, peak_move, exit_trigger, dimensions text, etc. Do not echo the English — you MUST produce Chinese output.
- Use standard financial Chinese terminology: 主题 (theme), 暴露/敞口 (exposure), 受益方 (beneficiary), 退出信号 (exit signal), 结构性差异 (structural differences), 催化剂 (catalyst), 成本 (costs), 供应链 (supply chain), 央行 (central bank), 利率 (rates), 制裁 (sanctions), 关税 (tariffs), 管制 (controls), 原型 (archetype), 基础设施 (infrastructure), 危机 (crisis).
- Keep ticker symbols (e.g. NVDA, AAPL), company names, years, percentages in original form.
- Category values (e.g. "supply_chain", "geopolitical") ARE content and must be translated to Chinese: "supply_chain" → "供应链", "geopolitical" → "地缘政治", "tech_breakthrough" → "技术突破", "macro_monetary" → "宏观货币", "pharma" → "制药/生物", "defense" → "国防".
- Keep concise and professional; do not add commentary.

Return JSON only with the same structure as the input, every translatable string replaced with Chinese.`

async function translateJson<T>(input: T): Promise<T> {
  const { anthropic, MODEL_SONNET } = await import('../lib/anthropic')
  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Translate the English values in this JSON object to Simplified Chinese. Return JSON only.\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  })
  const block = response.content[0]
  const text = block && block.type === 'text' ? block.text : ''
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  const firstBrace = cleaned.search(/[\[{]/)
  if (firstBrace === -1) throw new Error(`No JSON in response: ${text.slice(0, 200)}`)
  const openChar = cleaned[firstBrace]
  const closeChar = openChar === '[' ? ']' : '}'
  const lastClose = cleaned.lastIndexOf(closeChar)
  if (lastClose === -1) throw new Error(`Unterminated JSON: ${text.slice(0, 200)}`)
  const json = cleaned.slice(firstBrace, lastClose + 1)
  return JSON.parse(json) as T
}

async function fetchThemes(limit?: number) {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  let q = supabaseAdmin
    .from('themes')
    .select('id, name, summary, name_zh, summary_zh')
    .in('status', ['active', 'cooling'])
    .is('name_zh', null)
    .order('last_active_at', { ascending: false })
  if (limit) q = q.limit(limit)
  const { data } = await q
  return data ?? []
}

async function fetchArchetypes(limit?: number) {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  let q = supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, description, category, playbook, name_zh, description_zh, category_zh, playbook_zh')
    .eq('is_active', true)
    .not('deprecated', 'is', true)
    .is('name_zh', null)
  if (limit) q = q.limit(limit)
  const { data } = await q
  return data ?? []
}

async function fetchRecommendations(limit?: number) {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  let q = supabaseAdmin
    .from('theme_recommendations')
    .select('id, ticker_symbol, role_reasoning, role_reasoning_zh')
    .not('role_reasoning', 'is', null)
    .is('role_reasoning_zh', null)
  if (limit) q = q.limit(limit)
  const { data } = await q
  return data ?? []
}

async function fetchNarratives(limit?: number) {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  let q = supabaseAdmin
    .from('market_narratives')
    .select('id, title, description, title_zh, description_zh')
    .eq('is_active', true)
    .is('title_zh', null)
  if (limit) q = q.limit(limit)
  const { data } = await q
  return data ?? []
}

async function fetchCandidates(limit?: number) {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  let q = supabaseAdmin
    .from('archetype_candidates')
    .select('id, title, description, title_zh, description_zh')
    .eq('status', 'pending')
    .is('title_zh', null)
  if (limit) q = q.limit(limit)
  const { data } = await q
  return data ?? []
}

async function fetchRegimeSnapshots(limit?: number) {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  let q = supabaseAdmin
    .from('market_regime_snapshots')
    .select(
      'id, regime_label, configuration_guidance, earnings_reasoning, valuation_reasoning, fed_reasoning, economic_reasoning, credit_reasoning, sentiment_reasoning, regime_label_zh'
    )
    .is('regime_label_zh', null)
    .order('snapshot_date', { ascending: false })
  if (limit) q = q.limit(limit)
  const { data } = await q
  return data ?? []
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function runBackfill() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const pLimit = (await import('p-limit')).default

  const themes = await fetchThemes()
  const archetypes = await fetchArchetypes()
  const recs = await fetchRecommendations()
  const narratives = await fetchNarratives()
  const candidates = await fetchCandidates()
  const regimes = await fetchRegimeSnapshots()

  console.log(`\n=== Backfill scope ===`)
  console.log(`  themes:          ${themes.length}`)
  console.log(`  archetypes:      ${archetypes.length}`)
  console.log(`  recommendations: ${recs.length}`)
  console.log(`  narratives:      ${narratives.length}`)
  console.log(`  candidates:      ${candidates.length}`)
  console.log(`  regime snapshots:${regimes.length}`)

  const limit = pLimit(CONCURRENCY)
  let writes = 0

  // Themes · batch 8 (strip id, pair by index)
  for (const batch of chunk(themes, BATCH_SIZE)) {
    const input = batch.map((t) => ({ name: t.name, summary: t.summary }))
    const translated = (await limit(() => translateJson(input))) as Array<{
      name: string
      summary: string
    }>
    for (let i = 0; i < batch.length; i++) {
      const tz = translated[i]
      if (!tz) continue
      await supabaseAdmin
        .from('themes')
        .update({ name_zh: tz.name, summary_zh: tz.summary })
        .eq('id', batch[i].id)
      writes++
    }
    console.log(`  themes +${batch.length} (total ${writes})`)
  }

  // Archetypes · 1 per call (playbook heavy), strip id
  for (const arch of archetypes) {
    const input = {
      name: arch.name,
      description: arch.description,
      category: arch.category,
      playbook: arch.playbook,
    }
    const translated = await limit(() => translateJson(input))
    const { name, description, category, playbook } = translated as {
      name: string
      description: string
      category: string
      playbook: unknown
    }
    await supabaseAdmin
      .from('theme_archetypes')
      .update({
        name_zh: name,
        description_zh: description,
        category_zh: category,
        playbook_zh: playbook,
      })
      .eq('id', arch.id)
    writes++
    console.log(`  archetype ${arch.id} done (total ${writes})`)
  }

  // Recommendations · batch 8 (strip id)
  for (const batch of chunk(recs, BATCH_SIZE)) {
    const input = batch.map((r) => ({ role_reasoning: r.role_reasoning }))
    const translated = (await limit(() => translateJson(input))) as Array<{
      role_reasoning: string
    }>
    for (let i = 0; i < batch.length; i++) {
      const row = translated[i]
      if (!row) continue
      await supabaseAdmin
        .from('theme_recommendations')
        .update({ role_reasoning_zh: row.role_reasoning })
        .eq('id', batch[i].id)
      writes++
    }
    console.log(`  recs +${batch.length} (total ${writes})`)
  }

  // Narratives · batch 8
  for (const batch of chunk(narratives, BATCH_SIZE)) {
    const input = batch.map((n) => ({ title: n.title, description: n.description }))
    const translated = (await limit(() => translateJson(input))) as Array<{
      title: string
      description: string
    }>
    for (let i = 0; i < batch.length; i++) {
      const row = translated[i]
      if (!row) continue
      await supabaseAdmin
        .from('market_narratives')
        .update({ title_zh: row.title, description_zh: row.description })
        .eq('id', batch[i].id)
      writes++
    }
    console.log(`  narratives +${batch.length} (total ${writes})`)
  }

  // Candidates · batch 8
  for (const batch of chunk(candidates, BATCH_SIZE)) {
    const input = batch.map((c) => ({ title: c.title, description: c.description }))
    const translated = (await limit(() => translateJson(input))) as Array<{
      title: string
      description: string
    }>
    for (let i = 0; i < batch.length; i++) {
      const row = translated[i]
      if (!row) continue
      await supabaseAdmin
        .from('archetype_candidates')
        .update({ title_zh: row.title, description_zh: row.description })
        .eq('id', batch[i].id)
      writes++
    }
    console.log(`  candidates +${batch.length} (total ${writes})`)
  }

  // Regime snapshots · 1 per call (multi-field)
  for (const r of regimes) {
    const input = {
      regime_label: r.regime_label,
      configuration_guidance: r.configuration_guidance,
      earnings_reasoning: r.earnings_reasoning,
      valuation_reasoning: r.valuation_reasoning,
      fed_reasoning: r.fed_reasoning,
      economic_reasoning: r.economic_reasoning,
      credit_reasoning: r.credit_reasoning,
      sentiment_reasoning: r.sentiment_reasoning,
    }
    const translated = (await limit(() => translateJson(input))) as Record<string, string>
    await supabaseAdmin
      .from('market_regime_snapshots')
      .update({
        regime_label_zh: translated.regime_label,
        configuration_guidance_zh: translated.configuration_guidance,
        earnings_reasoning_zh: translated.earnings_reasoning,
        valuation_reasoning_zh: translated.valuation_reasoning,
        fed_reasoning_zh: translated.fed_reasoning,
        economic_reasoning_zh: translated.economic_reasoning,
        credit_reasoning_zh: translated.credit_reasoning,
        sentiment_reasoning_zh: translated.sentiment_reasoning,
      })
      .eq('id', r.id)
    writes++
    console.log(`  regime snapshot ${r.id} done (total ${writes})`)
  }

  console.log(`\nTotal DB writes: ${writes}`)
}

async function runDryRun() {
  const themes = await fetchThemes(2)
  const archetypes = await fetchArchetypes(1)
  const recs = await fetchRecommendations(2)

  console.log('=== DRY RUN · 5 samples ===\n')

  // Sample 1-2: themes
  if (themes.length > 0) {
    const input = themes.map((t) => ({ id: t.id, name: t.name, summary: t.summary }))
    const translated = (await translateJson(input)) as Array<{
      id: string
      name: string
      summary: string
    }>
    console.log('--- THEMES ---')
    translated.forEach((tz, i) => {
      const orig = themes[i]
      console.log(`[theme ${tz.id.slice(0, 8)}]`)
      console.log(`  EN name:    ${orig.name}`)
      console.log(`  ZH name:    ${tz.name}`)
      console.log(`  EN summary: ${orig.summary?.slice(0, 100) ?? '(null)'}`)
      console.log(`  ZH summary: ${tz.summary?.slice(0, 100) ?? '(null)'}`)
      console.log('')
    })
  }

  // Sample 3: archetype with playbook (strip id so model doesn't treat whole object as code)
  if (archetypes.length > 0) {
    const a = archetypes[0]
    const input = {
      name: a.name,
      description: a.description,
      category: a.category,
      playbook: a.playbook,
    }
    const translated = (await translateJson(input)) as {
      name: string
      description: string
      category: string
      playbook: Record<string, unknown>
    }
    console.log('--- ARCHETYPE (name + desc + playbook sample) ---')
    console.log(`[arch ${a.id}]`)
    console.log(`  EN name:        ${a.name}`)
    console.log(`  ZH name:        ${translated.name}`)
    console.log(`  EN category:    ${a.category}`)
    console.log(`  ZH category:    ${translated.category}`)
    console.log(`  EN description: ${a.description?.slice(0, 150) ?? '(null)'}`)
    console.log(`  ZH description: ${translated.description?.slice(0, 150) ?? '(null)'}`)
    const enPb = a.playbook as { historical_cases?: Array<{ name?: string; peak_move?: string }> }
    const zhPb = translated.playbook as {
      historical_cases?: Array<{ name?: string; peak_move?: string }>
    }
    const enCase = enPb?.historical_cases?.[0]
    const zhCase = zhPb?.historical_cases?.[0]
    if (enCase && zhCase) {
      console.log(`  EN case[0].name:      ${enCase.name}`)
      console.log(`  ZH case[0].name:      ${zhCase.name}`)
      console.log(`  EN case[0].peak_move: ${enCase.peak_move?.slice(0, 150)}`)
      console.log(`  ZH case[0].peak_move: ${zhCase.peak_move?.slice(0, 150)}`)
    }
    console.log('')
  }

  // Sample 4-5: recommendations
  if (recs.length > 0) {
    const input = recs.map((r) => ({ id: r.id, role_reasoning: r.role_reasoning }))
    const translated = (await translateJson(input)) as Array<{
      id: string
      role_reasoning: string
    }>
    console.log('--- RECOMMENDATIONS ---')
    translated.forEach((rz, i) => {
      const orig = recs[i]
      console.log(`[rec ${orig.ticker_symbol}]`)
      console.log(`  EN: ${orig.role_reasoning}`)
      console.log(`  ZH: ${rz.role_reasoning}`)
      console.log('')
    })
  }

  console.log('=== Dry run complete. No DB writes. ===')
  console.log('If translations look good, re-run without --dry-run to execute full backfill.')
}

async function main() {
  if (DRY_RUN) {
    await runDryRun()
  } else {
    await runBackfill()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
