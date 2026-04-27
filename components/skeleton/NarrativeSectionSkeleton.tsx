'use client'

import { SkelBar } from './Bar'

function NarrativeCardSkeleton() {
  return (
    <div
      className="nshock-skel-card"
      style={{
        padding: '20px 22px',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <SkelBar width={90} height={11} />
      <SkelBar width="78%" height={22} />
      <SkelBar width="100%" height={12} />
      <SkelBar width="85%" height={12} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <SkelBar width={64} height={24} radius={12} />
        <SkelBar width={64} height={24} radius={12} />
        <SkelBar width={64} height={24} radius={12} />
      </div>
    </div>
  )
}

export function NarrativeSectionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <NarrativeCardSkeleton key={i} />
      ))}
    </div>
  )
}
