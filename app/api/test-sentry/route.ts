import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    throw new Error('Sentry test error from /api/test-sentry')
  } catch (error) {
    Sentry.captureException(error, {
      tags: { source: 'manual-test', file: 'test-sentry-route' },
    })

    await Sentry.flush(2000)

    return NextResponse.json(
      {
        success: true,
        message: 'Test error sent to Sentry',
        env: process.env.NODE_ENV,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'CDN-Cache-Control': 'no-store',
        },
      },
    )
  }
}
