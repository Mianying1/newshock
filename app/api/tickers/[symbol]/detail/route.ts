import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import {
  fetchTickerDetail,
  type TickerDetailBundle,
  type Loc,
} from '@/lib/queries/ticker-detail'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
      headers: { 'Cache-Control': 'private, max-age=120' },
    })
  } catch (e) {
    Sentry.captureException(e, { tags: { stage: 'ticker_detail', symbol } })
    const body: Resp = { ok: false, error: e instanceof Error ? e.message : 'unknown' }
    return Response.json(body, { status: 500 })
  }
}
