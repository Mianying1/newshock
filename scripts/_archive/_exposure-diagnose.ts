import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  // Fetch all recommendations · paginate to bypass 1000 row default
  const all: Array<{ exposure_type: string | null; theme_id: string; added_at: string | null }> = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('theme_recommendations')
      .select('exposure_type, theme_id, added_at')
      .range(from, from + PAGE - 1)
    if (error) { console.error('fetch err:', error.message); break }
    if (!data || data.length === 0) break
    all.push(...(data as typeof all))
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`total recs: ${all.length}`)

  // 1. Non-null distribution
  const typeDist: Record<string, number> = {}
  let nullCnt = 0
  for (const r of all ?? []) {
    if (r.exposure_type == null) nullCnt++
    else typeDist[r.exposure_type as string] = (typeDist[r.exposure_type as string] ?? 0) + 1
  }
  console.log(`\nnon-null distribution:`)
  for (const [k, v] of Object.entries(typeDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`)
  }
  console.log(`  NULL: ${nullCnt}`)

  // 2. Time distribution — group by day using added_at
  const byDay: Record<string, { nullCnt: number; total: number }> = {}
  for (const r of all ?? []) {
    const ts = r.added_at as string | null
    if (!ts) continue
    const day = ts.slice(0, 10)
    if (!byDay[day]) byDay[day] = { nullCnt: 0, total: 0 }
    byDay[day].total++
    if (r.exposure_type == null) byDay[day].nullCnt++
  }
  const days = Object.keys(byDay).sort().reverse().slice(0, 14)
  console.log(`\ndaily null distribution (last 14 days, desc):`)
  console.log(`  day         null  total  pct`)
  for (const d of days) {
    const { nullCnt, total } = byDay[d]
    const pct = ((nullCnt / total) * 100).toFixed(1)
    console.log(`  ${d}  ${String(nullCnt).padStart(4)}  ${String(total).padStart(5)}  ${pct}%`)
  }

  // Also earliest / latest span
  const sortedDays = Object.keys(byDay).sort()
  console.log(`\nearliest day: ${sortedDays[0]} · latest day: ${sortedDays[sortedDays.length - 1]}`)

  // 3. Top 10 themes by NULL count
  const { data: nullRecs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id')
    .is('exposure_type', null)
  const nullByTheme: Record<string, number> = {}
  for (const r of nullRecs ?? []) nullByTheme[r.theme_id as string] = (nullByTheme[r.theme_id as string] ?? 0) + 1
  const topIds = Object.entries(nullByTheme).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, created_at')
    .in('id', topIds.map(([id]) => id))
  const themeMap = new Map((themes ?? []).map((t) => [t.id as string, t]))

  // Also fetch total per theme for pct
  const { data: totalByThemeRows } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id')
    .in('theme_id', topIds.map(([id]) => id))
  const totalByTheme: Record<string, number> = {}
  for (const r of totalByThemeRows ?? []) totalByTheme[r.theme_id as string] = (totalByTheme[r.theme_id as string] ?? 0) + 1

  console.log(`\ntop 10 themes by NULL count:`)
  console.log(`  null  total  theme (status · created)`)
  for (const [tid, n] of topIds) {
    const t = themeMap.get(tid)
    const tot = totalByTheme[tid] ?? n
    console.log(`  ${String(n).padStart(4)}  ${String(tot).padStart(5)}  ${t?.name ?? '(unknown)'} (${t?.status ?? '?'} · ${(t?.created_at as string ?? '').slice(0, 10)})`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
