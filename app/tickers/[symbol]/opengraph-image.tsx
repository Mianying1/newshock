import { ImageResponse } from 'next/og'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const revalidate = 3600
export const alt = 'Newshock ticker'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function TickerOgImage({ params }: { params: { symbol: string } }) {
  const upper = params.symbol.toUpperCase()
  const { data } = await supabaseAdmin
    .from('tickers')
    .select('symbol, company_name, sector, market_cap_usd_b')
    .eq('symbol', upper)
    .maybeSingle()

  const company = data?.company_name?.trim() || ''
  const sector = data?.sector?.trim() || ''
  const mcap = data?.market_cap_usd_b
  const mcapLabel =
    typeof mcap === 'number' && mcap > 0
      ? mcap >= 1000
        ? `$${(mcap / 1000).toFixed(1)}T`
        : `$${mcap.toFixed(0)}B`
      : ''

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
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#7c5cff' }} />
          <span style={{ fontSize: 24, color: '#a8b3d4', letterSpacing: 1 }}>NEWSHOCK</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: 200,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: -4,
              color: '#fff',
            }}
          >
            {upper}
          </div>
          {company ? (
            <div style={{ fontSize: 42, color: '#c5cce6', lineHeight: 1.2 }}>{company}</div>
          ) : null}
          <div style={{ display: 'flex', gap: 16 }}>
            {sector ? (
              <span
                style={{
                  padding: '6px 16px',
                  fontSize: 22,
                  color: '#a8b3d4',
                  border: '1px solid #2a3458',
                  borderRadius: 999,
                }}
              >
                {sector}
              </span>
            ) : null}
            {mcapLabel ? (
              <span
                style={{
                  padding: '6px 16px',
                  fontSize: 22,
                  color: '#a8b3d4',
                  border: '1px solid #2a3458',
                  borderRadius: 999,
                }}
              >
                {mcapLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 22, color: '#7a86ad' }}>Thematic exposure · catalysts</span>
          <span style={{ fontSize: 22, color: '#7a86ad' }}>newshock</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
