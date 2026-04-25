'use client'

import { theme } from 'antd'

const { useToken } = theme

interface FilterPillProps {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}

export function FilterPill({ label, count, active, onClick }: FilterPillProps) {
  const { token } = useToken()
  return (
    <button
      type="button"
      onClick={onClick}
      className="filter-pill"
      data-active={active || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 14px',
        borderRadius: 999,
        border: `1px solid ${active ? token.colorText : 'transparent'}`,
        background: active ? token.colorText : token.colorFillAlter,
        color: active ? token.colorBgContainer : token.colorText,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        lineHeight: 1,
        cursor: 'pointer',
        transition: 'background-color 160ms ease, color 160ms ease, border-color 160ms ease',
      }}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          style={{
            fontSize: 11,
            fontFamily: token.fontFamilyCode,
            color: active ? token.colorBgContainer : token.colorTextTertiary,
            opacity: active ? 0.72 : 1,
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}
