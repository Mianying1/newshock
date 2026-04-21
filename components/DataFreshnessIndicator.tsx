'use client'

import { useEffect, useState } from 'react'

interface FreshnessData {
  age_label: string
  is_stale: boolean
}

export default function DataFreshnessIndicator() {
  const [data, setData] = useState<FreshnessData | null>(null)

  useEffect(() => {
    fetch('/api/meta/freshness')
      .then((r) => r.json())
      .then(setData)
      .catch(() => null)
  }, [])

  if (!data) return null

  return (
    <span className={data.is_stale ? 'text-red-600' : 'text-zinc-400'}>
      数据更新于 {data.age_label}
      {data.is_stale ? ' (可能延迟)' : ''}
    </span>
  )
}
