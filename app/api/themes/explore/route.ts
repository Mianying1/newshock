import { buildThemeRadar } from '@/lib/recommendation-builder'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const awareness = searchParams.get('awareness')

  try {
    const result = await buildThemeRadar({
      include_exploratory: true,
      category_filter: category ? [category] : undefined,
      awareness_filter: awareness ? [awareness] : undefined,
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
