import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { updateRegimeSnapshot, type ManualInputs } from '@/lib/market-regime'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const manualPath = path.resolve(process.cwd(), 'data/manual-regime-inputs.json')
    const manual = JSON.parse(fs.readFileSync(manualPath, 'utf8')) as ManualInputs
    const { snapshot_date, scores } = await updateRegimeSnapshot(manual)
    return Response.json({
      snapshot_date,
      total: scores.total,
      label: scores.label,
      guidance: scores.guidance,
      dimensions: {
        earnings: scores.earnings.score,
        valuation: scores.valuation.score,
        fed: scores.fed.score,
        economic: scores.economic.score,
        credit: scores.credit.score,
        sentiment: scores.sentiment.score,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
