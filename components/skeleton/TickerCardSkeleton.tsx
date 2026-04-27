'use client'

import { SkelBar, SkelCircle } from './Bar'

export function TickerCardSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 8px',
        borderTop: '1px solid var(--skeleton-card-border)',
      }}
    >
      <SkelCircle size={20} />
      <SkelBar width={60} height={14} />
      <span style={{ flex: 1 }} />
      <SkelBar width={48} height={14} />
    </div>
  )
}

export function TickerCardSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TickerCardSkeleton key={i} />
      ))}
    </>
  )
}
