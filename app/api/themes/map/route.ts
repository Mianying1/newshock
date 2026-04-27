import { buildThemeRadar } from '@/lib/recommendation-builder'

export async function GET() {
  try {
    const result = await buildThemeRadar({
      tier: 'umbrella',
      statuses: ['active', 'cooling'],
      include_children: true,
      limit: 50,
    })
    return Response.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
