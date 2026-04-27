'use client'

import { SkelBar } from './Bar'

export function TickerRowSkeleton() {
  return (
    <div
      className="nshock-skel-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 18px',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
        <SkelBar width={140} height={11} />
        <SkelBar width="60%" height={18} />
      </div>
      <SkelBar width={56} height={28} />
    </div>
  )
}

export function TickerRowSkeletonList({ count = 10 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <TickerRowSkeleton key={i} />
      ))}
    </div>
  )
}
