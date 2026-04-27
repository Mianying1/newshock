import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('events')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) {
    return Response.json(
      { last_event_at: null, age_label: '暂无数据' },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  }

  const lastTime = new Date(data.created_at)
  const ageMinutes = Math.floor((Date.now() - lastTime.getTime()) / 60000)

  let label: string
  if (ageMinutes < 60) {
    label = `${ageMinutes} 分钟前`
  } else if (ageMinutes < 60 * 24) {
    label = `${Math.floor(ageMinutes / 60)} 小时前`
  } else {
    const days = Math.floor(ageMinutes / (60 * 24))
    label = `${days} 天前`
  }

  return Response.json(
    {
      last_event_at: data.created_at,
      age_minutes: ageMinutes,
      age_label: label,
      is_stale: ageMinutes > 60 * 24,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}
