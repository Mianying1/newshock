import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Newshock System Health Check')
  console.log(`  ${new Date().toISOString()}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // ===== Themes =====
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, status, name, days_hot, last_active_at')

  const now = Date.now()
  const themesWithIdle = (themes || []).map((t: any) => ({
    ...t,
    days_since_last_event: t.last_active_at
      ? Math.floor((now - new Date(t.last_active_at).getTime()) / 86400000)
      : null,
  }))

  const themesByStatus = themesWithIdle.reduce((acc: any, t: any) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  console.log('📊 Themes')
  console.log(`  Total: ${themesWithIdle.length}`)
  Object.entries(themesByStatus).forEach(([s, n]) => {
    console.log(`    ${s}: ${n}`)
  })

  const idleThemes = themesWithIdle
    .filter((t: any) => t.status === 'active' && t.days_since_last_event != null)
    .sort((a: any, b: any) => b.days_since_last_event - a.days_since_last_event)
    .slice(0, 3)

  if (idleThemes.length > 0) {
    console.log(`  Top 3 idle active themes:`)
    idleThemes.forEach((t: any) => {
      const warn = t.days_since_last_event >= 30 ? ' ⚠️ should be cooling' : ''
      console.log(`    - ${t.name}: ${t.days_since_last_event}d${warn}`)
    })
  }
  console.log()

  // ===== Archetypes =====
  const { data: archetypes } = await supabaseAdmin
    .from('theme_archetypes')
    .select('id, name, is_active, playbook')

  const activeArchs = (archetypes || []).filter((a: any) => a.is_active)
  const withPlaybook = activeArchs.filter((a: any) =>
    a.playbook && Object.keys(a.playbook).length > 0
  )
  const missingPlaybook = activeArchs.filter((a: any) =>
    !a.playbook || Object.keys(a.playbook).length === 0
  )
  const chineseRegex = /[\u4e00-\u9fff]/
  const chineseArchs = activeArchs.filter((a: any) => chineseRegex.test(a.name))

  console.log('🎯 Archetypes')
  console.log(`  Total active: ${activeArchs.length}`)
  console.log(`  With playbook: ${withPlaybook.length}`)
  if (missingPlaybook.length > 0) {
    console.log(`  ⚠️  Missing playbook: ${missingPlaybook.length}`)
    missingPlaybook.slice(0, 5).forEach((a: any) => {
      console.log(`      - ${a.id}: ${a.name}`)
    })
  }
  if (chineseArchs.length > 0) {
    console.log(`  ⚠️  Chinese names: ${chineseArchs.length}`)
    chineseArchs.forEach((a: any) => console.log(`      - ${a.id}: ${a.name}`))
  }
  console.log()

  // ===== Tickers =====
  const { data: tickers } = await supabaseAdmin
    .from('tickers')
    .select('symbol, logo_url, is_recommendation_candidate')

  const totalTickers = tickers?.length || 0
  const withLogo = (tickers || []).filter((t: any) => t.logo_url).length
  const withoutLogo = totalTickers - withLogo

  console.log('💹 Tickers')
  console.log(`  Total: ${totalTickers}`)
  console.log(`  With logo: ${withLogo} (${totalTickers ? Math.round(withLogo / totalTickers * 100) : 0}%)`)
  if (withoutLogo > 0) {
    console.log(`  ⚠️  Without logo: ${withoutLogo}`)
  }
  console.log()

  // ===== Events =====
  const { data: allEvents } = await supabaseAdmin
    .from('events')
    .select('id, processing_status, event_date, trigger_theme_id')

  const totalEvents = allEvents?.length || 0
  const processedEvents = (allEvents || []).filter((e: any) =>
    e.processing_status === 'processed' || e.trigger_theme_id
  ).length
  const deferredEvents = (allEvents || []).filter((e: any) =>
    e.processing_status === 'deferred'
  ).length
  const orphanEvents = (allEvents || []).filter((e: any) =>
    !e.trigger_theme_id && e.processing_status !== 'deferred'
  ).length

  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString()
  const recent7d = (allEvents || []).filter((e: any) =>
    e.event_date && e.event_date >= sevenDaysAgo
  ).length

  console.log('📰 Events')
  console.log(`  Total: ${totalEvents}`)
  console.log(`  Processed: ${processedEvents}`)
  console.log(`  Deferred: ${deferredEvents}`)
  if (orphanEvents > 0) {
    console.log(`  ⚠️  Orphan (no theme, not deferred): ${orphanEvents}`)
  }
  console.log(`  Last 7 days: +${recent7d}`)
  console.log()

  // ===== Recommendations =====
  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('id, exposure_direction')

  const totalRecs = recs?.length || 0
  const byDirection = (recs || []).reduce((acc: any, r: any) => {
    acc[r.exposure_direction || 'null'] = (acc[r.exposure_direction || 'null'] || 0) + 1
    return acc
  }, {})

  console.log('📈 Recommendations')
  console.log(`  Total: ${totalRecs}`)
  Object.entries(byDirection).forEach(([d, n]) => {
    console.log(`    ${d}: ${n}`)
  })
  console.log()

  // ===== Narratives =====
  const { data: narratives } = await supabaseAdmin
    .from('market_narratives')
    .select('id, title, status, generated_at')
    .order('generated_at', { ascending: false })
    .limit(5)

  console.log('📖 Market Narratives')
  console.log(`  Recent ${narratives?.length || 0}:`)
  narratives?.forEach((n: any) => {
    const age = Math.floor((now - new Date(n.generated_at).getTime()) / 86400000)
    console.log(`    - ${n.title} (${age}d ago, ${n.status})`)
  })
  console.log()

  // ===== Archetype Candidates =====
  const { data: candidates } = await supabaseAdmin
    .from('archetype_candidates')
    .select('id, status, estimated_importance')

  const candByStatus = (candidates || []).reduce((acc: any, c: any) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  console.log('🔬 Archetype Candidates (weekly scan)')
  if (Object.keys(candByStatus).length === 0) {
    console.log('    (none)')
  }
  Object.entries(candByStatus).forEach(([s, n]) => {
    console.log(`    ${s}: ${n}`)
  })
  console.log()

  // ===== Warnings summary =====
  const warnings: string[] = []
  if (missingPlaybook.length > 0)
    warnings.push(`${missingPlaybook.length} archetypes missing playbook`)
  if (chineseArchs.length > 0)
    warnings.push(`${chineseArchs.length} Chinese archetype names`)
  if (withoutLogo > 0)
    warnings.push(`${withoutLogo} tickers without logo`)
  if (orphanEvents > 0)
    warnings.push(`${orphanEvents} orphan events`)
  const shouldBeCooling = idleThemes.filter((t: any) => t.days_since_last_event >= 30).length
  if (shouldBeCooling > 0)
    warnings.push(`${shouldBeCooling} active themes should be cooling (cron will fix)`)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (warnings.length === 0) {
    console.log('✅ All systems healthy')
  } else {
    console.log(`⚠️  ${warnings.length} warning(s):`)
    warnings.forEach(w => console.log(`    - ${w}`))
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch(console.error)
