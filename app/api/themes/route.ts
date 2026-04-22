import { buildThemeRadar } from '@/lib/recommendation-builder'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const awareness = searchParams.get('awareness')
  const statusParam = searchParams.get('status')
  const limitParam = searchParams.get('limit')
  const tierParam = searchParams.get('tier')

  const statuses = statusParam
    ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined

  const tier = tierParam === 'umbrella' || tierParam === 'subtheme' ? tierParam : undefined

  try {
    const result = await buildThemeRadar({
      include_exploratory: false,
      category_filter: category ? [category] : undefined,
      awareness_filter: awareness ? [awareness] : undefined,
      statuses,
      limit: limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50,
      tier,
    })
    return Response.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
