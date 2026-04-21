import { buildThemeRadar } from '@/lib/recommendation-builder'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const awareness = searchParams.get('awareness')

  try {
    const result = await buildThemeRadar({
      include_exploratory: false,
      category_filter: category ? [category] : undefined,
      awareness_filter: awareness ? [awareness] : undefined,
      limit: 50,
    })
    return Response.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
