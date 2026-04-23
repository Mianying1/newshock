import { config } from 'dotenv'
config({ path: '.env.local' })

type Alert = {
  id: string
  theme_id: string
  alert_type: string
  from_stage: string | null
  to_stage: string
  reason: string | null
  ratio: number | null
  days_since_first_event: number | null
  severity: string
  seen_at: string | null
  created_at: string
}
type Theme = { id: string; name: string; previous_cycle_stage: string | null; current_cycle_stage: string | null }

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: alerts } = await supabaseAdmin
    .from('theme_alerts')
    .select('*')
    .gte('created_at', new Date(Date.now() - 7 * 86400 * 1000).toISOString())
    .order('created_at', { ascending: false })
  const recent = (alerts ?? []) as Alert[]

  console.log(`=== theme_alerts · last 7d: ${recent.length} ===\n`)

  const bySev: Record<string, number> = { info: 0, warn: 0, critical: 0 }
  const byTransition: Record<string, number> = {}
  for (const a of recent) {
    bySev[a.severity] = (bySev[a.severity] ?? 0) + 1
    const key = `${a.from_stage ?? 'null'}→${a.to_stage}`
    byTransition[key] = (byTransition[key] ?? 0) + 1
  }
  console.log('severity:')
  for (const [k, v] of Object.entries(bySev)) console.log(`  ${k.padEnd(10)} ${v}`)
  console.log('\ntransitions:')
  for (const [k, v] of Object.entries(byTransition).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`)

  // Hydrate theme names
  const themeIds = Array.from(new Set(recent.map((a) => a.theme_id)))
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, previous_cycle_stage, current_cycle_stage')
    .in('id', themeIds.length > 0 ? themeIds : ['00000000-0000-0000-0000-000000000000'])
  const tById = new Map<string, Theme>()
  for (const t of (themes ?? []) as Theme[]) tById.set(t.id, t)

  console.log(`\n--- recent alerts (up to 20) ---`)
  for (const a of recent.slice(0, 20)) {
    const t = tById.get(a.theme_id)
    console.log(`[${a.severity.padEnd(8)}] ${(a.from_stage ?? 'null').padEnd(5)} → ${a.to_stage.padEnd(5)} · ${(t?.name ?? '?').slice(0, 55)} · ratio=${a.ratio?.toFixed(2) ?? '-'} · ${a.created_at.slice(0, 19)}`)
    if (a.reason) console.log(`           reason: ${a.reason}`)
  }

  // previous_cycle_stage backfill status (after Phase 6 first run, should all be set)
  const { count: withPrev } = await supabaseAdmin
    .from('themes')
    .select('id', { count: 'exact', head: true })
    .not('previous_cycle_stage', 'is', null)
    .eq('status', 'active')
  const { count: activeTotal } = await supabaseAdmin
    .from('themes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  console.log(`\nprevious_cycle_stage backfilled: ${withPrev}/${activeTotal} active themes`)
}

main().catch((e) => { console.error(e); process.exit(1) })
