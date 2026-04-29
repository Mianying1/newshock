import { ImageResponse } from 'next/og'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const revalidate = 3600
export const alt = 'Newshock theme'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function ThemeOgImage({ params }: { params: { id: string } }) {
  const { data } = await supabaseAdmin
    .from('themes')
    .select('name, name_zh, summary, summary_zh, category')
    .eq('id', params.id)
    .maybeSingle()

  const title = data?.name?.trim() || data?.name_zh?.trim() || 'Theme'
  const summary = (data?.summary?.trim() || data?.summary_zh?.trim() || '').slice(0, 180)
  const category = data?.category?.trim() || ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0b0f1a 0%, #1a1f3a 100%)',
          color: '#fff',
          padding: '64px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: '#7c5cff',
            }}
          />
          <span style={{ fontSize: 24, color: '#a8b3d4', letterSpacing: 1 }}>NEWSHOCK</span>
          {category ? (
            <span
              style={{
                marginLeft: 16,
                padding: '4px 12px',
                fontSize: 18,
                color: '#a8b3d4',
                border: '1px solid #2a3458',
                borderRadius: 999,
              }}
            >
              {category}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {summary ? (
            <div style={{ fontSize: 28, color: '#c5cce6', lineHeight: 1.4 }}>{summary}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 22, color: '#7a86ad' }}>Thematic Investing Intelligence</span>
          <span style={{ fontSize: 22, color: '#7a86ad' }}>newshock</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
