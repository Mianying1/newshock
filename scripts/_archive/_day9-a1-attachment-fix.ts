import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../../lib/supabase-admin')

  // load archetypes for flatten
  const { data: archs } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, typical_tickers, deprecated')
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

  // load dark match events
  const { data: darkEvents } = await supabaseAdmin
    .from('events')
    .select('id, mentioned_tickers, classifier_reasoning, headline, event_date')
    .eq('source_name', 'SEC EDGAR 8-K Filings')
    .eq('level_of_impact', 'subtheme')
    .is('trigger_theme_id', null)
  const darkMatch = (darkEvents ?? []).filter((e) =>
    e.classifier_reasoning && !e.classifier_reasoning.startsWith('[8-K exploratory')
  )

  // load themes for archetype → best theme lookup
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id, status, theme_strength_score, event_count')
    .in('status', ['active', 'cooling'])

  const bestThemeByArch = new Map<string, { id: string; name: string }>()
  for (const t of themes ?? []) {
    if (!t.archetype_id) continue
    const cur = bestThemeByArch.get(t.archetype_id)
    if (!cur) bestThemeByArch.set(t.archetype_id, { id: t.id, name: t.name })
    else {
      // prefer higher theme_strength_score, fallback higher event_count
      const curRow = (themes ?? []).find((r) => r.id === cur.id)
      const aScore = t.theme_strength_score ?? 0
      const bScore = curRow?.theme_strength_score ?? 0
      if (aScore > bScore) bestThemeByArch.set(t.archetype_id, { id: t.id, name: t.name })
    }
  }

  // classify each dark event to best archetype
  type Plan = { event_id: string; headline: string; tickers: string[]; archetype_id: string; theme_id: string; theme_name: string; overlap: number }
  const plans: Plan[] = []
  for (const ev of darkMatch) {
    const evTickers: string[] = ev.mentioned_tickers ?? []
    let best: { archId: string; overlap: number } | null = null
    for (const a of archs ?? []) {
      if (a.deprecated) continue
      const at = flatten(a.typical_tickers)
      const overlap = evTickers.filter((t) => at.includes(t)).length
      if (overlap > 0 && (!best || overlap > best.overlap)) best = { archId: a.id, overlap }
    }
    if (!best) continue
    const theme = bestThemeByArch.get(best.archId)
    if (!theme) continue // dark archetype (no active theme) - not A.1 scope
    plans.push({
      event_id: ev.id,
      headline: ev.headline ?? '',
      tickers: evTickers,
      archetype_id: best.archId,
      theme_id: theme.id,
      theme_name: theme.name,
      overlap: best.overlap,
    })
  }

  console.log(`=== plan · ${plans.length} attachment backfills ===`)
  for (const p of plans) {
    console.log(`\n[${p.tickers.join(',')}] overlap=${p.overlap}`)
    console.log(`  headline: ${p.headline.slice(0, 80)}`)
    console.log(`  archetype: ${p.archetype_id}`)
    console.log(`  → theme: ${p.theme_name} (${p.theme_id})`)
    console.log(`  event_id: ${p.event_id}`)
  }

  const args = process.argv.slice(2)
  if (!args.includes('--apply')) {
    console.log(`\n(dry-run · pass --apply to execute)`)
    return
  }

  console.log(`\n=== applying ${plans.length} updates ===`)
  let ok = 0, fail = 0
  for (const p of plans) {
    const { error } = await supabaseAdmin
      .from('events')
      .update({ trigger_theme_id: p.theme_id })
      .eq('id', p.event_id)
      .is('trigger_theme_id', null) // safety: only if still null
    if (error) {
      console.log(`  FAIL ${p.event_id}: ${error.message}`)
      fail++
    } else {
      console.log(`  OK ${p.event_id} → ${p.theme_name}`)
      ok++
    }
  }
  console.log(`\ndone · ok=${ok} fail=${fail}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
