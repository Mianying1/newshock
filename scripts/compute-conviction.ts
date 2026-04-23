/**
 * Phase 4 · Conviction Score batch runner.
 *
 * Usage:
 *   npx tsx scripts/compute-conviction.ts --theme-id=<uuid>
 *   npx tsx scripts/compute-conviction.ts --sample=5
 *   npx tsx scripts/compute-conviction.ts --all
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

interface CliArgs {
  themeId: string | null
  sample: number | null
  all: boolean
}

function parseArgs(): CliArgs {
  const a: CliArgs = { themeId: null, sample: null, all: false }
  for (const arg of process.argv.slice(2)) {
    if (arg === '--all') a.all = true
    else if (arg.startsWith('--theme-id=')) a.themeId = arg.slice(11)
    else if (arg.startsWith('--sample=')) a.sample = parseInt(arg.slice(9), 10)
  }
  if (!a.all && !a.themeId && a.sample === null) a.sample = 5
  return a
}

async function main(): Promise<void> {
  const args = parseArgs()
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const { computeConviction } = await import('../lib/conviction-score')

  let targets: Array<{ id: string; name: string; theme_strength_score: number | null; source: string | null; theme_tier: string | null }> = []

  if (args.themeId) {
    const { data } = await supabaseAdmin
      .from('themes')
      .select('id, name, theme_strength_score, source, theme_tier')
      .eq('id', args.themeId)
      .single()
    if (data) targets = [data as typeof targets[number]]
  } else {
    const { data } = await supabaseAdmin
      .from('themes')
      .select('id, name, theme_strength_score, source, theme_tier')
      .eq('status', 'active')
      .order('theme_strength_score', { ascending: false, nullsFirst: false })
    targets = (data ?? []) as typeof targets

    if (args.sample !== null && args.sample > 0 && !args.all) {
      // Pick diverse sample: high / mid / low strength + at least 1 subtheme
      const topHalf = targets.slice(0, Math.max(1, Math.floor(targets.length / 2)))
      const lowHalf = targets.slice(Math.max(1, Math.floor(targets.length / 2)))
      const subs = targets.filter((t) => t.theme_tier === 'subtheme')
      const picked = new Map<string, typeof targets[number]>()
      for (const t of topHalf.slice(0, Math.ceil(args.sample / 2))) picked.set(t.id, t)
      for (const t of lowHalf.slice(0, 1)) picked.set(t.id, t)
      for (const t of subs.slice(0, 1)) picked.set(t.id, t)
      for (const t of targets) {
        if (picked.size >= args.sample) break
        picked.set(t.id, t)
      }
      targets = Array.from(picked.values()).slice(0, args.sample)
    }
  }

  console.log(`[compute-conviction] targets: ${targets.length}`)
  if (targets.length === 0) {
    console.log('nothing to score')
    return
  }

  let totalCost = 0
  const results: Array<{ name: string; score: number; breakdown: unknown; reasoning: string; reasoning_zh: string; cost: number }> = []
  const failed: Array<{ name: string; error: string }> = []

  for (const t of targets) {
    process.stdout.write(`\n━━━ ${t.name}\n`)
    process.stdout.write(`  strength=${t.theme_strength_score ?? '?'} · source=${t.source ?? '?'} · tier=${t.theme_tier ?? '?'}\n`)
    try {
      const r = await computeConviction(t.id)
      totalCost += r.cost_usd
      results.push({
        name: t.name,
        score: r.score,
        breakdown: r.breakdown,
        reasoning: r.reasoning,
        reasoning_zh: r.reasoning_zh,
        cost: r.cost_usd,
      })
      console.log(`  score=${r.score.toFixed(1)} cost=$${r.cost_usd.toFixed(4)}`)
      console.log(`  breakdown=${JSON.stringify(r.breakdown)}`)
      console.log(`  EN: ${r.reasoning}`)
      console.log(`  ZH: ${r.reasoning_zh}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      failed.push({ name: t.name, error: msg.slice(0, 300) })
      console.log(`  [error] ${msg.slice(0, 200)}`)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`scored:       ${results.length}`)
  console.log(`failed:       ${failed.length}`)
  console.log(`total cost:   $${totalCost.toFixed(4)}`)
  if (results.length > 0) {
    const avg = results.reduce((a, b) => a + b.score, 0) / results.length
    const max = Math.max(...results.map((r) => r.score))
    const min = Math.min(...results.map((r) => r.score))
    console.log(`score avg:    ${avg.toFixed(2)} · min ${min.toFixed(1)} · max ${max.toFixed(1)}`)
  }
  if (failed.length > 0) {
    console.log('\nFAILED:')
    for (const f of failed) console.log(`  · ${f.name}: ${f.error}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
