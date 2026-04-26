import { supabaseAdmin } from '../lib/supabase-admin'

async function main() {
  console.log('=== 1. All-time source distribution ===')
  const { data: all, error: e1 } = await supabaseAdmin
    .from('events')
    .select('source_name, created_at')

  if (e1) {
    console.error('Query 1 error:', e1)
    return
  }

  const byAll: Record<string, { count: number; first: string; last: string }> = {}
  for (const r of all ?? []) {
    const s = r.source_name ?? '(null)'
    if (!byAll[s]) byAll[s] = { count: 0, first: r.created_at, last: r.created_at }
    byAll[s].count++
    if (r.created_at < byAll[s].first) byAll[s].first = r.created_at
    if (r.created_at > byAll[s].last) byAll[s].last = r.created_at
  }
  const total = all?.length ?? 0
  console.log(`Total events: ${total}`)
  const sorted = Object.entries(byAll).sort((a, b) => b[1].count - a[1].count)
  for (const [s, v] of sorted) {
    const pct = ((v.count / total) * 100).toFixed(1)
    console.log(
      `  ${s.padEnd(30)} ${String(v.count).padStart(6)} (${pct.padStart(5)}%)  ${v.first.slice(0, 10)} → ${v.last.slice(0, 10)}`
    )
  }

  console.log('\n=== 2. Last 7 days source distribution ===')
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent, error: e2 } = await supabaseAdmin
    .from('events')
    .select('source_name')
    .gte('created_at', cutoff)

  if (e2) {
    console.error('Query 2 error:', e2)
    return
  }

  const by7: Record<string, number> = {}
  for (const r of recent ?? []) {
    const s = r.source_name ?? '(null)'
    by7[s] = (by7[s] ?? 0) + 1
  }
  const total7 = recent?.length ?? 0
  console.log(`Total events (7d): ${total7}`)
  const sorted7 = Object.entries(by7).sort((a, b) => b[1] - a[1])
  for (const [s, c] of sorted7) {
    const pct = total7 ? ((c / total7) * 100).toFixed(1) : '0.0'
    console.log(`  ${s.padEnd(30)} ${String(c).padStart(6)} (${pct.padStart(5)}%)`)
  }

  console.log('\n=== Summary ===')
  console.log(`Unique sources all-time: ${sorted.length}`)
  console.log(`Unique sources last 7d : ${sorted7.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
