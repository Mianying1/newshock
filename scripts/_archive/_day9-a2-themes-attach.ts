import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFileSync } from 'fs'

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
  const spaceDraft = JSON.parse(readFileSync('/tmp/day9-archetype-drafts/space_infrastructure_commercialization.json', 'utf-8'))
  const waterDraft = JSON.parse(readFileSync('/tmp/day9-archetype-drafts/water_infrastructure.json', 'utf-8'))

  // re-derive attach plan from current DB state (archetypes now have tickers)
  const { data: archs } = await supabaseAdmin.from('theme_archetypes').select('id, typical_tickers, deprecated')
  const { data: darkEvents } = await supabaseAdmin
    .from('events')
    .select('id, mentioned_tickers, classifier_reasoning, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .eq('level_of_impact', 'subtheme')
    .is('trigger_theme_id', null)
  const darkMatch = (darkEvents ?? []).filter((e) => e.classifier_reasoning && !e.classifier_reasoning.startsWith('[8-K exploratory'))

  const planByArch: Record<string, Array<{ event_id: string; date: string | null }>> = {}
  for (const ev of darkMatch) {
    const evT: string[] = ev.mentioned_tickers ?? []
    let best: { id: string; overlap: number } | null = null
    for (const a of archs ?? []) {
      if (a.deprecated) continue
      const at = flatten(a.typical_tickers)
      const overlap = evT.filter((t) => at.includes(t)).length
      if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: a.id, overlap }
    }
    if (!best) continue
    if (!planByArch[best.id]) planByArch[best.id] = []
    planByArch[best.id].push({ event_id: ev.id, date: ev.event_date })
  }

  const themeDefs = [
    { archetype_id: 'utility_grid_capex', name: 'Utility Grid Capex · AI Datacenter Power PPA', name_zh: '电网基建投资 · AI 数据中心电力合约', summary: utilityDraft.description, summary_zh: utilityDraft.description_zh },
    { archetype_id: 'space_infrastructure_commercialization', name: 'Space Infrastructure Commercialization · LEO & Launch', name_zh: '商业空间基建 · 低轨与发射', summary: spaceDraft.description, summary_zh: spaceDraft.description_zh },
    { archetype_id: 'water_infrastructure_failure', name: 'Water Infrastructure Stress · Scarcity Trade', name_zh: '水务基建压力 · 稀缺主题', summary: waterDraft.description, summary_zh: waterDraft.description_zh },
  ]

  const createdThemeIds: Record<string, string> = {}
  console.log(`=== Step 4 · create themes ===`)
  for (const d of themeDefs) {
    const events = planByArch[d.archetype_id] ?? []
    const dates = events.map((e) => e.date).filter((x): x is string => !!x).sort()
    const firstEventAt = dates[0] ?? new Date().toISOString()
    console.log(`  ${d.archetype_id}: events=${events.length} first_event_at=${firstEventAt}`)
    if (!apply) continue
    const { data, error } = await supabaseAdmin
      .from('themes')
      .insert({
        archetype_id: d.archetype_id,
        name: d.name,
        name_zh: d.name_zh,
        summary: d.summary,
        summary_zh: d.summary_zh,
        status: 'active',
        first_event_at: firstEventAt,
        last_active_at: new Date().toISOString(),
        theme_strength_score: 70,
        event_count: events.length,
        source: 'manual_day9',
      })
      .select('id')
      .single()
    if (error) throw new Error(`INSERT theme ${d.archetype_id}: ${error.message}`)
    createdThemeIds[d.archetype_id] = (data as { id: string }).id
    console.log(`    theme_id=${data.id}`)
  }

  console.log(`\n=== Step 5 · attach events ===`)
  for (const d of themeDefs) {
    const events = planByArch[d.archetype_id] ?? []
    if (events.length === 0) continue
    const themeId = createdThemeIds[d.archetype_id]
    console.log(`  ${d.archetype_id}: ${events.length} events → ${themeId ?? '(dry-run)'}`)
    if (!apply) continue
    let ok = 0, fail = 0
    for (const e of events) {
      const { error } = await supabaseAdmin
        .from('events')
        .update({ trigger_theme_id: themeId })
        .eq('id', e.event_id)
        .is('trigger_theme_id', null)
      if (error) { console.log(`    FAIL ${e.event_id}: ${error.message}`); fail++ } else ok++
    }
    console.log(`    ok=${ok} fail=${fail}`)
  }

  if (apply) {
    console.log(`\n=== created themes ===`)
    for (const [arch, tid] of Object.entries(createdThemeIds)) console.log(`  ${arch} → ${tid}`)
  } else {
    console.log(`\n(dry-run · pass --apply to execute)`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
