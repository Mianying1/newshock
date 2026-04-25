import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const FMP_BUCKET = 'FMP Backfill'

export async function GET() {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('source_name')
    .gte('event_date', cutoff)
    .not('source_name', 'is', null)
    .limit(5000)

  if (error) {
    return Response.json({ sources: [], error: error.message }, { status: 500 })
  }

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ source_name: string | null }>) {
    if (!row.source_name) continue
    const bucket = row.source_name.startsWith('FMP Backfill') ? FMP_BUCKET : row.source_name
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  const sources = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return Response.json({ sources })
}
