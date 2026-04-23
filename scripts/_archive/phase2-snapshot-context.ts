/**
 * scripts/phase2-snapshot-context.ts
 *
 * Print exactly the ACTIVE_THEMES block the Sonnet sees,
 * plus DB ground-truth for comparison.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

async function main(): Promise<void> {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { getMatcherContext } = await import('../lib/theme-matcher')

  console.log('━━━ ACTIVE_THEMES block (as Sonnet sees it) ━━━')
  const ctx = await getMatcherContext(true)
  console.log(`[meta] archetype_count=${ctx.archetypes.length} active_theme_count=${ctx.activeThemes.length} ticker_count=${ctx.availableTickers.length}`)
  console.log(ctx.activeThemesText)

  console.log('\n━━━ DB ground-truth · status IN (active,cooling,exploratory_candidate,archived) last 90d ━━━')
  const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString()
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, archetype_id, status, summary, last_active_at, theme_strength_score, event_count')
    .in('status', ['active', 'cooling', 'exploratory_candidate', 'archived'])
    .gt('last_active_at', cutoff)
    .order('last_active_at', { ascending: false })

  console.log(`[db] count=${themes?.length ?? 0}`)
  for (const t of themes ?? []) {
    console.log(`  ${t.status.padEnd(22)} ${t.last_active_at.slice(0,10)} ev=${String(t.event_count).padStart(2)} str=${String(t.theme_strength_score).padStart(3)} arch=${(t.archetype_id ?? '—').padEnd(30)} "${t.name}"`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
