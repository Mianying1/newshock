'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button, Empty } from 'antd'
import { useI18n } from '@/lib/i18n-context'

export default function TickerDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { locale } = useI18n()
  const params = useParams<{ symbol: string }>()
  const symbol = params?.symbol?.toString().toUpperCase() ?? '—'

  useEffect(() => {
    Sentry.captureException(error, {
      tags: { route: 'ticker_detail', symbol },
      extra: { digest: error.digest },
    })
  }, [error, symbol])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: 'var(--bg)',
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, marginBottom: 4 }}>
              {locale === 'zh'
                ? `${symbol} · 数据准备中`
                : `${symbol} · Data being prepared`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {locale === 'zh' ? '请稍后再试' : 'Please retry shortly'}
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Button onClick={() => reset()}>
            {locale === 'zh' ? '重试' : 'Retry'}
          </Button>
          <Link href="/tickers">
            <Button type="primary">
              {locale === 'zh' ? '返回列表' : 'Back to list'}
            </Button>
          </Link>
        </div>
      </Empty>
    </div>
  )
}
