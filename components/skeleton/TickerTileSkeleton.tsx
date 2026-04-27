'use client'

import { SkelBar } from './Bar'

export function TickerTileSkeleton() {
  return (
    <div
      className="nshock-skel-card"
      style={{
        padding: '12px 14px 10px',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <SkelBar width={56} height={16} />
        <SkelBar width={32} height={16} />
      </div>
      <SkelBar width="85%" height={10} />
      <SkelBar width="60%" height={10} />
    </div>
  )
}

export function TickerTileColumnSkeleton({ count }: { count: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <TickerTileSkeleton key={i} />
      ))}
    </div>
  )
}
