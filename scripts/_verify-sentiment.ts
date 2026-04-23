import { config } from 'dotenv'
config({ path: '.env.local' })

type Theme = {
  id: string
  name: string
  status: string
  sentiment_score: number | null
  dominant_sentiment: string | null
  recent_signal_shift: { last_shift_days_ago: number; direction: string; key_events: Array<{ title: string; date: string; direction: string; weight: number }> } | null
}

type Event = {
  trigger_theme_id: string | null
  supports_or_contradicts: string | null
  headline: string
}

async function main() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')

  const { data: themes } = await supabaseAdmin
    .from('themes')
    .select('id, name, status, sentiment_score, dominant_sentiment, recent_signal_shift')
    .eq('status', 'active')
  const ts = (themes ?? []) as Theme[]

  const dist: Record<string, number> = { bullish: 0, mixed: 0, bearish: 0, neutral: 0 }
  for (const t of ts) dist[t.dominant_sentiment ?? 'unknown'] = (dist[t.dominant_sentiment ?? 'unknown'] ?? 0) + 1
  console.log(`=== sentiment verification (${ts.length} active themes) ===\n`)
  console.log('distribution:')
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(10)} ${v}`)

  const withScore = ts.filter((t) => t.sentiment_score !== null)
  const sorted = [...withScore].sort((a, b) => (b.sentiment_score ?? 0) - (a.sentiment_score ?? 0))

  console.log(`\ntop 5 bullish:`)
  for (const t of sorted.slice(0, 5)) {
    console.log(`  ${(t.sentiment_score ?? 0).toFixed(2).padStart(6)} [${t.dominant_sentiment}] ${t.name.slice(0, 65)}`)
  }

  console.log(`\ntop 5 bearish:`)
  for (const t of sorted.slice(-5).reverse()) {
    console.log(`  ${(t.sentiment_score ?? 0).toFixed(2).padStart(6)} [${t.dominant_sentiment}] ${t.name.slice(0, 65)}`)
  }

  // Volatile: abs(shift key events total weight) high, last_shift_days_ago small
  const volatile = ts
    .filter((t) => t.recent_signal_shift && t.recent_signal_shift.key_events.length > 0)
    .sort((a, b) => {
      const aw = a.recent_signal_shift!.key_events.reduce((s, e) => s + Math.abs(e.weight), 0)
      const bw = b.recent_signal_shift!.key_events.reduce((s, e) => s + Math.abs(e.weight), 0)
      return bw - aw
    })
  console.log(`\ntop 5 volatile (strongest recent shifts):`)
  for (const t of volatile.slice(0, 5)) {
    const s = t.recent_signal_shift!
    console.log(`  [${s.direction.padEnd(22)}] ${s.last_shift_days_ago}d · ${t.name.slice(0, 55)}`)
    for (const e of s.key_events.slice(0, 2)) {
      console.log(`    · ${e.direction.padEnd(12)} w=${e.weight.toFixed(2)} · ${e.title.slice(0, 70)}`)
    }
  }

  // Cross-check: each bullish theme actually has supports-dominant events
  const bullishThemes = ts.filter((t) => t.dominant_sentiment === 'bullish')
  if (bullishThemes.length > 0) {
    const ids = bullishThemes.slice(0, 5).map((t) => t.id)
    const { data: evs } = await supabaseAdmin
      .from('events')
      .select('trigger_theme_id, supports_or_contradicts, headline')
      .in('trigger_theme_id', ids)
      .gte('event_date', new Date(Date.now() - 30 * 86400 * 1000).toISOString())
    const evsList = (evs ?? []) as Event[]
    const byId: Record<string, { sup: number; con: number }> = {}
    for (const e of evsList) {
      const k = e.trigger_theme_id ?? ''
      byId[k] = byId[k] ?? { sup: 0, con: 0 }
      if (e.supports_or_contradicts === 'supports') byId[k].sup++
      else if (e.supports_or_contradicts === 'contradicts') byId[k].con++
    }
    console.log(`\ncross-check · top 5 bullish themes · their events counts (30d):`)
    for (const t of bullishThemes.slice(0, 5)) {
      const c = byId[t.id] ?? { sup: 0, con: 0 }
      const ok = c.sup > c.con ? '✓' : '✗ WARN'
      console.log(`  ${ok} ${t.name.slice(0, 55)} · supports=${c.sup} contradicts=${c.con}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
