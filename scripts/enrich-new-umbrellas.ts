import { config } from 'dotenv'
config({ path: '.env.local' })

const NEW_ARCHETYPE_IDS = [
  'ai_capex_infrastructure',
  'fed_rate_cycle_transition',
  'crypto_institutional_infrastructure',
  'energy_transition_capex_cycle',
  'pharma_innovation_super_cycle',
]

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { enrichThemeRecommendations } = await import('../lib/theme-enrichment')

  const { data: umbrellaRows, error: umbErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id')
    .eq('theme_tier', 'umbrella')
    .eq('source', 'manual')
    .in('archetype_id', NEW_ARCHETYPE_IDS)
  if (umbErr) throw new Error(`umbrella fetch: ${umbErr.message}`)
  const umbrellas = umbrellaRows ?? []
  console.log(`New umbrellas to enrich: ${umbrellas.length}`)

  let totalSeeded = 0
  let totalEnrichCost = 0
  let totalElapsed = 0
  const perUmbrella: Array<{
    name: string
    seeded: number
    kept: number
    removed: number
    elapsed: number
    cost: number
  }> = []

  // Step A · Seed recommendations for each umbrella
  for (const u of umbrellas) {
    console.log(`\n━━━ ${u.name} (${u.archetype_id}) ━━━`)

    const { data: existing } = await supabaseAdmin
      .from('theme_recommendations')
      .select('ticker_symbol')
      .eq('theme_id', u.id)
    if ((existing ?? []).length > 0) {
      console.log(`  already has ${existing!.length} recs — skip seeding`)
      continue
    }

    const { data: arch } = await supabaseAdmin
      .from('theme_archetypes')
      .select('typical_tickers')
      .eq('id', u.archetype_id)
      .maybeSingle()
    const archTickers = (arch?.typical_tickers ?? []) as string[]

    const { data: childIds } = await supabaseAdmin
      .from('themes')
      .select('id')
      .eq('parent_theme_id', u.id)
    const childIdArr = (childIds ?? []).map((r) => r.id)

    let childTickers: string[] = []
    if (childIdArr.length > 0) {
      const { data: childRecs } = await supabaseAdmin
        .from('theme_recommendations')
        .select('ticker_symbol')
        .in('theme_id', childIdArr)
      childTickers = Array.from(
        new Set((childRecs ?? []).map((r) => r.ticker_symbol.toUpperCase()))
      )
    }

    const archSet = new Set(archTickers.map((t) => t.toUpperCase()))
    const combined = Array.from(new Set([...archSet, ...childTickers]))

    // Filter against tickers table (FK constraint)
    const { data: validTickers } = await supabaseAdmin
      .from('tickers')
      .select('symbol')
      .in('symbol', combined)
    const validSet = new Set((validTickers ?? []).map((r) => r.symbol.toUpperCase()))
    const usable = combined.filter((t) => validSet.has(t))
    const dropped = combined.filter((t) => !validSet.has(t))

    console.log(
      `  seed sources: archetype=${archTickers.length} children=${childIdArr.length}(${childTickers.length} tickers) combined=${combined.length} usable=${usable.length} dropped=${dropped.length}`
    )
    if (dropped.length > 0) console.log(`  dropped (not in tickers table): ${dropped.join(', ')}`)

    if (usable.length === 0) {
      console.log(`  no usable tickers — cannot enrich`)
      continue
    }

    const rows = usable.map((t) => ({
      theme_id: u.id,
      ticker_symbol: t,
      tier: archSet.has(t) ? 1 : 2,
      exposure_direction: 'uncertain',
    }))

    const { error: insErr } = await supabaseAdmin
      .from('theme_recommendations')
      .insert(rows)
    if (insErr) {
      console.error(`  seed insert failed: ${insErr.message}`)
      continue
    }
    console.log(`  seeded ${rows.length} recs`)
    totalSeeded += rows.length

    // Step B · Enrich (refine → max 12, framework language, exposure_type)
    const res = await enrichThemeRecommendations(u.id)
    if (!res.ok) {
      console.error(`  enrich FAILED: ${res.error}`)
      perUmbrella.push({
        name: u.name,
        seeded: rows.length,
        kept: 0,
        removed: 0,
        elapsed: res.stats?.elapsed_sec ?? 0,
        cost: res.stats?.cost_usd ?? 0,
      })
      continue
    }
    const cost = res.stats?.cost_usd ?? 0
    const elapsed = res.stats?.elapsed_sec ?? 0
    totalEnrichCost += cost
    totalElapsed += elapsed
    console.log(
      `  enrich OK: kept=${res.kept_tickers.length} removed=${res.removed} · ${elapsed.toFixed(1)}s · $${cost.toFixed(4)}`
    )
    console.log(`  kept: ${res.kept_tickers.join(', ')}`)
    perUmbrella.push({
      name: u.name,
      seeded: rows.length,
      kept: res.kept_tickers.length,
      removed: res.removed,
      elapsed,
      cost,
    })
  }

  // Step C · Final report: distribution, samples
  console.log(`\n\n=========================================`)
  console.log(`FINAL REPORT`)
  console.log(`=========================================`)
  console.log(`Total seeded: ${totalSeeded}`)
  console.log(`Total Sonnet cost: $${totalEnrichCost.toFixed(4)}`)
  console.log(`Total Sonnet time: ${totalElapsed.toFixed(1)}s`)

  console.log(`\nPer-umbrella:`)
  for (const p of perUmbrella) {
    console.log(
      `  · ${p.name}: seeded=${p.seeded} → kept=${p.kept} removed=${p.removed} · ${p.elapsed.toFixed(1)}s · $${p.cost.toFixed(4)}`
    )
  }

  // Distribution by exposure_type + sample reasoning
  const umbIds = umbrellas.map((u) => u.id)
  const { data: finalRecs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id, ticker_symbol, exposure_type, confidence_band, role_reasoning, exposure_direction, themes!inner(name)')
    .in('theme_id', umbIds)

  const byUmbrella = new Map<string, { direct: number; obs: number; pressure: number; other: number; samples: string[] }>()
  for (const r of (finalRecs ?? []) as unknown as Array<{
    theme_id: string
    ticker_symbol: string
    exposure_type: string | null
    confidence_band: string | null
    role_reasoning: string | null
    exposure_direction: string | null
    themes: { name: string } | { name: string }[] | null
  }>) {
    const themeName = Array.isArray(r.themes) ? r.themes[0]?.name : r.themes?.name
    const key = `${r.theme_id}|${themeName ?? '?'}`
    if (!byUmbrella.has(key)) byUmbrella.set(key, { direct: 0, obs: 0, pressure: 0, other: 0, samples: [] })
    const b = byUmbrella.get(key)!
    if (r.exposure_type === 'direct') b.direct++
    else if (r.exposure_type === 'observational') b.obs++
    else if (r.exposure_type === 'pressure') b.pressure++
    else b.other++
    if (b.samples.length < 2 && r.role_reasoning) {
      b.samples.push(`[${r.ticker_symbol}/${r.exposure_type ?? '?'}/${r.confidence_band ?? '?'}] ${r.role_reasoning}`)
    }
  }

  console.log(`\nExposure distribution & sample reasoning:`)
  for (const [key, b] of byUmbrella.entries()) {
    const [, name] = key.split('|')
    console.log(`\n  ${name}`)
    console.log(`    direct=${b.direct} observational=${b.obs} pressure=${b.pressure} other=${b.other}`)
    for (const s of b.samples) console.log(`    · ${s}`)
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
