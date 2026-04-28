'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'

interface FilterPillRowProps {
  label: ReactNode
  children: ReactNode
}

export function FilterPillRow({ label, children }: FilterPillRowProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false, hasOverflow: false })

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const update = () => {
      const overflow = el.scrollWidth - el.clientWidth > 1
      setEdges({
        hasOverflow: overflow,
        start: overflow && el.scrollLeft > 1,
        end: overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    Array.from(el.children).forEach((c) => ro.observe(c as Element))
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="filter-pill-row">
      {label}
      <div
        className={[
          'filter-pill-scroll',
          edges.hasOverflow ? 'has-overflow' : '',
          edges.start ? 'has-start' : '',
          edges.end ? 'has-end' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="filter-pill-track" ref={trackRef}>
          {children}
        </div>
        <span className="filter-pill-edge filter-pill-edge-start" aria-hidden>
          <LeftOutlined />
        </span>
        <span className="filter-pill-edge filter-pill-edge-end" aria-hidden>
          <RightOutlined />
        </span>
      </div>
    </div>
  )
}
