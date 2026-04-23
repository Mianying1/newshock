import { config } from 'dotenv'
config({ path: '.env.local' })

type Cand = {
  umbrella_theme_id: string
  angle_label: string
  confidence: number | null
  status: string
  proposed_tickers: string[] | null
}
type U = { id: string; name: string }

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data: cs } = await supabaseAdmin
    .from('new_angle_candidates')
    .select('umbrella_theme_id, angle_label, confidence, status, proposed_tickers')
    .order('confidence', { ascending: false })
  const cands = (cs ?? []) as Cand[]
  const { data: umbs } = await supabaseAdmin.from('themes').select('id, name').eq('theme_tier', 'umbrella')
  const uById = new Map<string, U>()
  for (const u of (umbs ?? []) as U[]) uById.set(u.id, u)

  console.log(`=== new_angle_candidates (${cands.length}) ===\n`)
  const byStatus: Record<string, number> = { approved: 0, pending: 0, dismissed: 0 }
  for (const c of cands) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
  console.log('by status:', byStatus)

  const byUmb = new Map<string, Cand[]>()
  for (const c of cands) { const a = byUmb.get(c.umbrella_theme_id) ?? []; a.push(c); byUmb.set(c.umbrella_theme_id, a) }

  for (const [uid, arr] of byUmb) {
    console.log(`\n${uById.get(uid)?.name} (${arr.length}):`)
    for (const c of arr) {
      console.log(`  [${c.status.padEnd(8)}] conf=${c.confidence?.toFixed(2) ?? '-'} · ${c.angle_label} · tickers=${(c.proposed_tickers ?? []).slice(0, 5).join(',')}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
