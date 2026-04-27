'use client'

import { SkelBar } from './Bar'

function ThemeMapCardSkeleton() {
  return (
    <div
      className="nshock-skel-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 320,
          flexShrink: 0,
          padding: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SkelBar width={64} height={16} radius={8} />
          <span style={{ flex: 1 }} />
          <SkelBar width={36} height={14} />
        </div>
        <SkelBar width="78%" height={22} />
        <SkelBar width="100%" height={12} />
        <SkelBar width="92%" height={12} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <SkelBar width={56} height={22} radius={11} />
          <SkelBar width={64} height={22} radius={11} />
          <SkelBar width={48} height={22} radius={11} />
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <SkelBar width="48%" height={36} radius={6} />
          <SkelBar width="48%" height={36} radius={6} />
        </div>
      </div>
      <div
        style={{
          borderTop: '1px solid var(--skeleton-card-border)',
          padding: '12px 20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <SkelBar width={80} height={10} />
        <SkelBar width="70%" height={12} />
        <SkelBar width="60%" height={12} />
      </div>
    </div>
  )
}

export function ThemeMapGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 20,
        marginTop: 8,
      }}
      className="theme-map-grid"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ThemeMapCardSkeleton key={i} />
      ))}
    </div>
  )
}
