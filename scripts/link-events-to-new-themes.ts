import { supabaseAdmin } from '@/lib/supabase-admin'
import { linkEventsToTheme } from '@/lib/theme-event-linker'

async function main() {
  const { data, error } = await supabaseAdmin
    .from('themes')
    .select('id, name')
    .eq('source', 'coverage_audit')
  if (error) throw new Error(error.message)
  const themes = data ?? []
  console.log(`coverage_audit themes: ${themes.length}`)

  let totalConfirmed = 0
  let totalCost = 0
  for (const t of themes) {
    const before = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('trigger_theme_id', t.id)
    const r = await linkEventsToTheme(t.id)
    totalConfirmed += r.confirmed
    totalCost += r.cost_usd
    const after = (before.count ?? 0) + r.confirmed
    console.log(
      `  ${t.name}: candidates=${r.candidates_found} newly_linked=${r.confirmed} total=${after} cost=$${r.cost_usd.toFixed(4)}${r.error ? ' err=' + r.error : ''}`
    )
  }
  console.log(`\nTotal newly-linked: ${totalConfirmed}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
