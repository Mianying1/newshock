'use client'

import type { CSSProperties } from 'react'

export function SkelBar({
  width,
  height = 14,
  radius = 4,
  style,
}: {
  width: number | string
  height?: number
  radius?: number
  style?: CSSProperties
}) {
  return (
    <span
      className="nshock-skel-bar"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  )
}

export function SkelCircle({ size = 24 }: { size?: number }) {
  return (
    <span
      className="nshock-skel-bar"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  )
}
