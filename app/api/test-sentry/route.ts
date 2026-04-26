import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    throw new Error('Sentry test error from /api/test-sentry')
  } catch (error) {
    Sentry.captureException(error, {
      tags: { source: 'manual-test', file: 'test-sentry-route' },
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    return NextResponse.json({
      success: true,
      message: 'Test error sent to Sentry',
      env: process.env.NODE_ENV,
    })
  }
}
