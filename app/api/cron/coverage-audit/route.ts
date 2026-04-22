import { NextRequest } from 'next/server'
import { runCoverageAudit } from '@/lib/coverage-audit'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const report = await runCoverageAudit()
    return Response.json({
      success: true,
      report_id: report.id,
      report_date: report.report_date,
      new_archetypes: report.suggested_new_archetypes.length,
      mergers: report.suggested_mergers.length,
      rebalancing: report.suggested_rebalancing.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
