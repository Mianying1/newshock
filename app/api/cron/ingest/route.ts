import { runIngest } from '@/lib/ingest'
import { generateThemesForPendingEvents } from '@/lib/theme-generator'
import { NextRequest } from 'next/server'

export const maxDuration = 300 // Vercel Pro: 5-minute timeout

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slot = (searchParams.get('slot') || 'eu_us_mid') as 'asia_eu' | 'eu_us_mid' | 'us_close'

  const startTime = Date.now()

  try {
    console.log(`[cron] Starting slot=${slot}`)

    // Step 1: Ingest new articles (skip built-in classifier — theme generator handles it)
    const ingestResult = await runIngest({
      slot,
      per_source_limit: 30,
      classify: false,
    })
    console.log(`[cron] Ingest done: ${ingestResult.new_inserted} new events`)

    // Step 2: Run LLM theme pipeline on newly pending events
    const themeResult = await generateThemesForPendingEvents({
      limit: 50,
      rate_limit: 5,
    })
    console.log(`[cron] Theme gen done: ${themeResult.themes_created} new themes`)

    return Response.json({
      success: true,
      slot,
      duration_ms: Date.now() - startTime,
      ingest: ingestResult,
      theme_generation: themeResult,
      timestamp: new Date().toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron] Error:', message)
    return Response.json(
      {
        success: false,
        slot,
        error: message,
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
