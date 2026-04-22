'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n-context'
import { formatMinutesAgo } from '@/lib/utils'

interface FreshnessData {
  age_minutes: number
  is_stale: boolean
}

export default function DataFreshnessIndicator() {
  const { t } = useI18n()
  const [data, setData] = useState<FreshnessData | null>(null)

  useEffect(() => {
    fetch('/api/meta/freshness')
      .then((r) => r.json())
      .then(setData)
      .catch(() => null)
  }, [])

  if (!data || typeof data.age_minutes !== 'number') return null

  const label = formatMinutesAgo(data.age_minutes, t)

  return (
    <span className={data.is_stale ? 'text-red-600' : 'text-zinc-400'}>
      {t('homepage.updated', { time: label })}
    </span>
  )
}
