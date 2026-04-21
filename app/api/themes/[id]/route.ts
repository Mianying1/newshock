import { buildSingleTheme } from '@/lib/recommendation-builder'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const theme = await buildSingleTheme(params.id)
    return Response.json(theme)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = msg.includes('not found') ? 404 : 500
    return Response.json({ error: msg }, { status })
  }
}
