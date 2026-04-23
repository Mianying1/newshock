import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { data, error, count } = await supabaseAdmin
    .from('theme_alerts')
    .select('id, severity, to_stage, from_stage, created_at, seen_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) { console.error(error); process.exit(1) }
  console.log(`total rows: ${count}`)
  for (const r of data ?? []) {
    console.log(`  ${r.created_at} · ${r.severity} · ${r.from_stage} → ${r.to_stage} · seen=${r.seen_at ?? '-'}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
