import { runIngest } from '@/lib/ingest'
import { generateThemesForPendingEvents } from '@/lib/theme-generator'
import { supabaseAdmin } from '@/lib/supabase-admin'

const COOLDOWN_MINUTES = 30

export const maxDuration = 300

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: latest } = await supabaseAdmin
    .from('events')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (latest) {
    const ageMinutes = (Date.now() - new Date(latest.created_at).getTime()) / 60000
    if (ageMinutes < COOLDOWN_MINUTES) {
      return Response.json(
        {
          error: 'Cooldown active',
          message: `上次更新 ${Math.floor(ageMinutes)} 分钟前, 请等待 ${COOLDOWN_MINUTES - Math.floor(ageMinutes)} 分钟`,
        },
        { status: 429 }
      )
    }
  }

  try {
    const ingestResult = await runIngest({ slot: 'eu_us_mid', per_source_limit: 30 })
    const themeResult = await generateThemesForPendingEvents({ limit: 50 })

    return Response.json({
      success: true,
      ingest: {
        new_inserted: ingestResult.new_inserted,
        skipped_duplicates: ingestResult.skipped_duplicates,
      },
      theme_generation: {
        themes_created: themeResult.themes_created,
        strengthen: themeResult.strengthen_existing,
        new_exploratory: themeResult.new_exploratory,
      },
      duration_ms: ingestResult.duration_ms + themeResult.duration_ms,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
