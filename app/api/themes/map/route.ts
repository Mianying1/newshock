import { buildThemeRadar } from '@/lib/recommendation-builder'

export async function GET() {
  try {
    const result = await buildThemeRadar({
      statuses: ['active', 'cooling'],
      limit: 50,
    })
    return Response.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
