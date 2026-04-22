'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n-context'
import { formatMinutesAgo } from '@/lib/utils'

interface OverviewData {
  active_count: number
  cooling_count: number
  rec_count: number
  updated_minutes: number | null
  last_ingest_minutes: number | null
}

export default function OverviewStrip() {
  const { t } = useI18n()
  const [data, setData] = useState<OverviewData | null>(null)

  useEffect(() => {
    fetch('/api/meta/overview')
      .then((r) => r.json())
      .then(setData)
      .catch(() => null)
  }, [])

  if (!data) return null

  const counts = [
    `${data.active_count} ${t('homepage.overview_active')}`,
    `${data.cooling_count} ${t('homepage.overview_cooling')}`,
    `${data.rec_count} ${t('homepage.overview_recs')}`,
  ].join(' · ')

  const timeParts: string[] = []
  if (data.updated_minutes !== null) {
    timeParts.push(
      t('homepage.overview_updated', { label: formatMinutesAgo(data.updated_minutes, t) })
    )
  }
  if (data.last_ingest_minutes !== null) {
    timeParts.push(
      t('homepage.overview_last_ingest', { label: formatMinutesAgo(data.last_ingest_minutes, t) })
    )
  }

  return (
    <div className="py-3 border-b border-zinc-100 text-center text-xs text-zinc-500 space-y-0.5">
      <p className="font-medium text-zinc-700">{counts}</p>
      {timeParts.length > 0 && <p className="text-zinc-400">{timeParts.join(' · ')}</p>}
    </div>
  )
}
