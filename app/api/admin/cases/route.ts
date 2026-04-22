import { NextRequest } from 'next/server'
import { listCasesByArchetype, seedCase, type HistoricalCaseInput } from '@/lib/case-library'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const groups = await listCasesByArchetype()
    return Response.json({ groups })
  } catch (e) {
    return Response.json(
      { groups: [], error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as HistoricalCaseInput | null
  if (!body || !body.archetype_id || !body.case_name || !body.data_source || !body.confidence) {
    return Response.json({ error: 'archetype_id, case_name, data_source, confidence required' }, { status: 400 })
  }
  try {
    const id = await seedCase(body)
    return Response.json({ id })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
