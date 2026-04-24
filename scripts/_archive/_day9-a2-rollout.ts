import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'

type Arch = { id: string; typical_tickers: unknown; deprecated: boolean | null }
type ThemeRow = { id: string; name: string; archetype_id: string | null; status: string | null }

function flatten(tt: unknown): string[] {
  if (!tt) return []
  if (Array.isArray(tt)) return tt.filter((x): x is string => typeof x === 'string')
  if (typeof tt === 'object') {
    const out: string[] = []
    for (const [k, v] of Object.entries(tt as Record<string, unknown>)) {
      if (k === 'dynamic') continue
      if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === 'string'))
    }
    return out
  }
  return []
}

async function main() {
  const apply = process.argv.includes('--apply')
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  const utilityDraft = JSON.parse(readFileSync('/tmp/day9-archetype-drafts/utility_grid_capex.json', 'utf-8'))
  utilityDraft.category = 'energy' // per user

  const spaceDraft = JSON.parse(readFileSync('/tmp/day9-archetype-drafts/space_infrastructure_commercialization.json', 'utf-8'))
  const waterDraft = JSON.parse(readFileSync('/tmp/day9-archetype-drafts/water_infrastructure.json', 'utf-8'))

  // ---------- Step 1 · INSERT utility_grid_capex ----------
  console.log(`\n=== Step 1 · INSERT utility_grid_capex (category=energy) ===`)
  const utilityPayload = {
    id: utilityDraft.id,
    name: utilityDraft.name,
    name_zh: utilityDraft.name_zh,
    category: 'energy',
    description: utilityDraft.description,
    description_zh: utilityDraft.description_zh,
    trigger_keywords: utilityDraft.trigger_keywords,
    typical_tickers: utilityDraft.typical_tickers,
    typical_duration_days_min: utilityDraft.typical_duration_days_min,
    typical_duration_days_max: utilityDraft.typical_duration_days_max,
    is_active: true,
    created_by: 'manual_v1_day9',
    confidence_level: utilityDraft.confidence_level,
    exclusion_rules: utilityDraft.exclusion_rules,
    notes: utilityDraft.notes,
    playbook: utilityDraft.playbook,
    deprecated: false,
  }
  console.log(`  payload tickers tier1: ${(utilityPayload.typical_tickers as Record<string, string[]>).tier1?.join(',')}`)
  console.log(`  keywords: ${utilityPayload.trigger_keywords.slice(0, 5).join(', ')}...`)

  if (apply) {
    const { error } = await supabaseAdmin.from('theme_archetypes').insert(utilityPayload)
    if (error) throw new Error(`INSERT utility failed: ${error.message}`)
    console.log(`  INSERTED ✓`)
  }

  // ---------- Step 2 · UPDATE space_infrastructure_commercialization ----------
  console.log(`\n=== Step 2 · UPDATE space_infrastructure_commercialization ===`)
  const spaceUpdate = {
    typical_tickers: {
      tier1: ['RKLB', 'ASTS'],
      tier2: ['LUNR', 'IRDM', 'SPIR'],
      tier3: ['BA', 'LMT'],
    },
    trigger_keywords: spaceDraft.trigger_keywords,
    playbook: spaceDraft.playbook,
    description: spaceDraft.description,
    description_zh: spaceDraft.description_zh,
    name_zh: spaceDraft.name_zh,
    exclusion_rules: spaceDraft.exclusion_rules,
    confidence_level: spaceDraft.confidence_level,
    notes: spaceDraft.notes,
  }
  console.log(`  tickers: tier1=${spaceUpdate.typical_tickers.tier1.join(',')} tier2=${spaceUpdate.typical_tickers.tier2.join(',')}`)

  if (apply) {
    const { error } = await supabaseAdmin.from('theme_archetypes').update(spaceUpdate).eq('id', 'space_infrastructure_commercialization')
    if (error) throw new Error(`UPDATE space failed: ${error.message}`)
    console.log(`  UPDATED ✓`)
  }

  // ---------- Step 3 · UPDATE water_infrastructure_failure ----------
  console.log(`\n=== Step 3 · UPDATE water_infrastructure_failure ===`)
  const waterUpdate = {
    typical_tickers: {
      tier1: ['AWK'],
      tier2: ['XYL', 'WTRG', 'AWR'],
      tier3: ['PNR', 'ROP'],
    },
    trigger_keywords: waterDraft.trigger_keywords,
    playbook: waterDraft.playbook,
  }
  console.log(`  tickers: tier1=${waterUpdate.typical_tickers.tier1.join(',')} tier2=${waterUpdate.typical_tickers.tier2.join(',')}`)

  if (apply) {
    const { error } = await supabaseAdmin.from('theme_archetypes').update(waterUpdate).eq('id', 'water_infrastructure_failure')
    if (error) throw new Error(`UPDATE water failed: ${error.message}`)
    console.log(`  UPDATED ✓`)
  }

  // ---------- Re-match dark events to find counts per archetype ----------
  console.log(`\n=== compute attach plan ===`)
  const { data: archs } = await supabaseAdmin.from('theme_archetypes').select('id, typical_tickers, deprecated')
  // if dry-run, inject our planned tickers so count estimate is accurate
  const archWithPlanned = (archs ?? []).map((a) => {
    if (a.id === 'space_infrastructure_commercialization' && !flatten(a.typical_tickers).length) {
      return { ...a, typical_tickers: spaceUpdate.typical_tickers }
    }
    if (a.id === 'water_infrastructure_failure' && !flatten(a.typical_tickers).length) {
      return { ...a, typical_tickers: waterUpdate.typical_tickers }
    }
    return a
  }) as Arch[]
  if (!archWithPlanned.some((a) => a.id === 'utility_grid_capex')) {
    archWithPlanned.push({ id: 'utility_grid_capex', typical_tickers: utilityPayload.typical_tickers, deprecated: false })
  }

  const { data: darkEvents } = await supabaseAdmin
    .from('events')
    .select('id, mentioned_tickers, classifier_reasoning, headline, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .eq('level_of_impact', 'subtheme')
    .is('trigger_theme_id', null)
  const darkMatch = (darkEvents ?? []).filter((e) => e.classifier_reasoning && !e.classifier_reasoning.startsWith('[8-K exploratory'))

  type Plan = { event_id: string; archetype_id: string; overlap: number; headline: string; tickers: string[]; date: string | null }
  const planByArch: Record<string, Plan[]> = {}
  for (const ev of darkMatch) {
    const evT: string[] = ev.mentioned_tickers ?? []
    let best: { id: string; overlap: number } | null = null
    for (const a of archWithPlanned) {
      if (a.deprecated) continue
      const at = flatten(a.typical_tickers)
      const overlap = evT.filter((t) => at.includes(t)).length
      if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: a.id, overlap }
    }
    if (!best) continue
    if (!planByArch[best.id]) planByArch[best.id] = []
    planByArch[best.id].push({ event_id: ev.id, archetype_id: best.id, overlap: best.overlap, headline: ev.headline ?? '', tickers: evT, date: ev.event_date })
  }

  const targetArchs = ['utility_grid_capex', 'space_infrastructure_commercialization', 'water_infrastructure_failure']
  for (const a of targetArchs) {
    const n = (planByArch[a] ?? []).length
    console.log(`  ${a}: ${n} events to attach`)
  }

  // ---------- Step 4 · create 3 themes (only for target archs with events) ----------
  console.log(`\n=== Step 4 · create themes ===`)
  const themeDefs: Array<{ archetype_id: string; name: string; name_zh: string; description: string | null; description_zh: string | null }> = [
    { archetype_id: 'utility_grid_capex', name: 'Utility Grid Capex · AI Datacenter Power PPA', name_zh: '电网基建投资 · AI 数据中心电力合约', description: utilityPayload.description, description_zh: utilityPayload.description_zh },
    { archetype_id: 'space_infrastructure_commercialization', name: 'Space Infrastructure Commercialization · LEO & Launch', name_zh: '商业空间基建 · 低轨与发射', description: spaceDraft.description, description_zh: spaceDraft.description_zh },
    { archetype_id: 'water_infrastructure_failure', name: 'Water Infrastructure Stress · Scarcity Trade', name_zh: '水务基建压力 · 稀缺主题', description: waterDraft.description, description_zh: waterDraft.description_zh },
  ]
  const createdThemeIds: Record<string, string> = {}

  for (const d of themeDefs) {
    const events = planByArch[d.archetype_id] ?? []
    const dates = events.map((e) => e.date).filter((x): x is string => !!x).sort()
    const firstEventAt = dates[0] ?? new Date().toISOString()
    console.log(`  ${d.archetype_id}: first_event_at=${firstEventAt} · events=${events.length}`)

    if (apply) {
      const { data, error } = await supabaseAdmin
        .from('themes')
        .insert({
          archetype_id: d.archetype_id,
          name: d.name,
          name_zh: d.name_zh,
          description: d.description,
          description_zh: d.description_zh,
          status: 'active',
          first_event_at: firstEventAt,
          theme_strength_score: 70,
          event_count: events.length,
        })
        .select('id')
        .single()
      if (error) throw new Error(`INSERT theme ${d.archetype_id}: ${error.message}`)
      createdThemeIds[d.archetype_id] = (data as { id: string }).id
      console.log(`    theme_id=${data.id}`)
    }
  }

  // ---------- Step 5 · attach events ----------
  console.log(`\n=== Step 5 · attach events ===`)
  for (const archId of targetArchs) {
    const events = planByArch[archId] ?? []
    if (events.length === 0) continue
    const themeId = createdThemeIds[archId]
    console.log(`  ${archId}: attaching ${events.length} events → theme ${themeId ?? '(dry-run)'}`)
    if (apply) {
      let ok = 0, fail = 0
      for (const e of events) {
        const { error } = await supabaseAdmin
          .from('events')
          .update({ trigger_theme_id: themeId })
          .eq('id', e.event_id)
          .is('trigger_theme_id', null)
        if (error) { console.log(`    FAIL ${e.event_id}: ${error.message}`); fail++ }
        else ok++
      }
      console.log(`    ok=${ok} fail=${fail}`)
    }
  }

  // ---------- summary ----------
  console.log(`\n=== summary ===`)
  if (!apply) {
    console.log(`  DRY-RUN · pass --apply to execute`)
    return
  }
  console.log(`  archetype INSERT: utility_grid_capex`)
  console.log(`  archetype UPDATE: space_infrastructure_commercialization, water_infrastructure_failure`)
  console.log(`  themes created: ${Object.keys(createdThemeIds).length}`)
  for (const [arch, tid] of Object.entries(createdThemeIds)) {
    console.log(`    ${arch} → ${tid}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
