import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import {
  fetchTickerDetail,
  type TickerDetailBundle,
  type Loc,
} from '@/lib/queries/ticker-detail'


type Resp =
  | (TickerDetailBundle & { ok: true })
  | { ok: false; error: string }

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Response> {
  const { symbol } = await params
  const loc: Loc = request.nextUrl.searchParams.get('locale') === 'zh' ? 'zh' : 'en'
  try {
    const bundle = await fetchTickerDetail(symbol, loc)
    const body: Resp = { ok: true, ...bundle }
    return Response.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (e) {
    Sentry.captureException(e, { tags: { stage: 'ticker_detail', symbol } })
    const body: Resp = { ok: false, error: e instanceof Error ? e.message : 'unknown' }
    return Response.json(body, { status: 500 })
  }
}
