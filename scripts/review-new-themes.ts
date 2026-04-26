import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString() // last 60 min

  // ── New themes ────────────────────────────────────────────────
  const { data: themes, error } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, theme_strength_score, created_at')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })

  if (error) { console.error(error); process.exit(1) }

  console.log(`\n━━ New themes (last 60 min): ${themes?.length ?? 0} ━━\n`)
  themes?.forEach(t => {
    const age = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000)
    console.log(`  [${t.id.slice(0,8)}] ${t.name}`)
    console.log(`           status=${t.status} score=${t.theme_strength_score} (${age}m ago)`)
  })

  // ── Semantic grouping ─────────────────────────────────────────
  const keywords: Record<string, string[]> = {
    'Iran/Oil/Middle East': ['iran', 'oil', 'opec', 'middle east', 'gulf', 'saudi', 'crude', 'petroleum'],
    'EV/Battery/Auto':      ['ev ', 'electric vehicle', 'battery', 'lithium', 'cathode', 'byd', 'tesla', 'auto'],
    'Crypto/Bitcoin/DeFi':  ['bitcoin', 'crypto', 'defi', 'blockchain', 'ethereum', 'stablecoin'],
    'AI/Chips/Semi':        ['ai ', 'chip', 'semiconductor', 'nvidia', 'inference', 'llm', 'gpu'],
    'China/Trade':          ['china', 'trade war', 'tariff', 'prc', 'beijing', 'export'],
    'Defense/Geopolitics':  ['defense', 'military', 'nato', 'ukraine', 'taiwan', 'drone', 'missile'],
    'Healthcare/Pharma':    ['drug', 'pharma', 'cancer', 'clinical', 'fda', 'biotech', 'alzheimer'],
    'Energy/Climate':       ['solar', 'wind', 'hydrogen', 'nuclear', 'carbon', 'lng', 'energy'],
  }

  const grouped: Record<string, typeof themes> = {}
  for (const t of themes ?? []) {
    const lower = t.name.toLowerCase()
    let matched = false
    for (const [group, kws] of Object.entries(keywords)) {
      if (kws.some(kw => lower.includes(kw))) {
        grouped[group] = [...(grouped[group] ?? []), t]
        matched = true
        break
      }
    }
    if (!matched) grouped['Other'] = [...(grouped['Other'] ?? []), t]
  }

  console.log('\n━━ Semantic grouping ━━\n')
  for (const [group, items] of Object.entries(grouped)) {
    if (items.length === 0) continue
    const warn = items.length >= 2 ? ' ⚠️  possible duplicates' : ''
    console.log(`  ${group} (${items.length})${warn}`)
    items.forEach(t => console.log(`    - ${t.name}`))
  }

  // ── Events per new theme ──────────────────────────────────────
  const themeIds = (themes ?? []).map(t => t.id)
  if (themeIds.length === 0) { console.log('\n(no new themes)'); return }

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('trigger_theme_id, headline, source_name, event_date')
    .in('trigger_theme_id', themeIds)
    .order('event_date', { ascending: true })

  const byTheme: Record<string, typeof events> = {}
  for (const e of events ?? []) {
    if (!e.trigger_theme_id) continue
    byTheme[e.trigger_theme_id] = [...(byTheme[e.trigger_theme_id] ?? []), e]
  }

  console.log('\n━━ Events per new theme ━━\n')
  for (const t of themes ?? []) {
    const evts = byTheme[t.id] ?? []
    console.log(`  ▸ ${t.name} (${evts.length} events)`)
    evts.forEach(e => {
      console.log(`      [${e.event_date?.slice(0,10)}] ${e.headline}`)
      console.log(`               ${e.source_name}`)
    })
    if (evts.length === 0) console.log('      (no events linked yet)')
    console.log()
  }
}

main().catch(console.error)
