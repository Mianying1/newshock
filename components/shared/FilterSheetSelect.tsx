'use client'

import { useMemo, useState } from 'react'
import { Drawer, Grid, Input, Select, theme } from 'antd'
import { useI18n } from '@/lib/i18n-context'

const { useToken } = theme
const { useBreakpoint } = Grid

export interface FilterSheetOption {
  value: string
  label: string
}

interface BaseProps {
  options: FilterSheetOption[]
  placeholder?: string
  title?: string
  className?: string
  showSearch?: boolean
  width?: number | string
  popupMatchSelectWidth?: boolean | number
  maxTagCount?: number | 'responsive'
  allowClear?: boolean
  variant?: 'filled' | 'outlined' | 'borderless' | 'underlined'
  suffixIcon?: React.ReactNode
  style?: React.CSSProperties
}

type SingleProps = BaseProps & {
  mode?: undefined
  value: string
  onChange: (v: string) => void
}

type MultipleProps = BaseProps & {
  mode: 'multiple'
  value: string[]
  onChange: (v: string[]) => void
}

export type FilterSheetSelectProps = SingleProps | MultipleProps

export function FilterSheetSelect(props: FilterSheetSelectProps) {
  const { token } = useToken()
  const { t } = useI18n()
  const screens = useBreakpoint()
  const isMobile = screens.md === false
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const {
    options,
    placeholder,
    title,
    className,
    showSearch,
    width,
    suffixIcon,
    style,
    variant,
    allowClear,
  } = props

  const filteredOptions = useMemo(() => {
    if (!showSearch || !query.trim()) return options
    const q = query.trim().toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query, showSearch])

  if (!isMobile) {
    if (props.mode === 'multiple') {
      return (
        <Select
          mode="multiple"
          allowClear={allowClear}
          variant={variant}
          className={className}
          suffixIcon={suffixIcon}
          placeholder={placeholder}
          value={props.value}
          onChange={props.onChange}
          options={options}
          style={{ width, ...style }}
          maxTagCount={props.maxTagCount}
          popupMatchSelectWidth={props.popupMatchSelectWidth}
          showSearch={showSearch}
          optionFilterProp="label"
        />
      )
    }
    return (
      <Select
        variant={variant}
        className={className}
        suffixIcon={suffixIcon}
        placeholder={placeholder}
        value={props.value}
        onChange={props.onChange}
        options={options}
        style={{ width, ...style }}
        showSearch={showSearch}
        optionFilterProp="label"
        popupMatchSelectWidth={props.popupMatchSelectWidth}
      />
    )
  }

  const isMultiple = props.mode === 'multiple'
  const selectedValues = isMultiple ? props.value : props.value ? [props.value] : []
  const triggerLabel = (() => {
    if (isMultiple) {
      const arr = props.value
      if (arr.length === 0) return placeholder ?? ''
      if (arr.length === 1) {
        return options.find((o) => o.value === arr[0])?.label ?? arr[0]
      }
      const first = options.find((o) => o.value === arr[0])?.label ?? arr[0]
      return `${first} +${arr.length - 1}`
    }
    if (!props.value) return placeholder ?? ''
    return options.find((o) => o.value === props.value)?.label ?? props.value
  })()

  const isPlaceholder =
    (isMultiple && props.value.length === 0) || (!isMultiple && !props.value)

  const handleSelect = (val: string) => {
    if (isMultiple) {
      const arr = props.value
      const next = arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]
      props.onChange(next)
    } else {
      props.onChange(val)
      setOpen(false)
    }
  }

  const handleClear = () => {
    if (isMultiple) props.onChange([])
    else props.onChange('')
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          height: 30,
          width,
          padding: '0 12px 0 14px',
          borderRadius: 999,
          border: '1px solid transparent',
          background: token.colorFillTertiary,
          color: isPlaceholder ? token.colorTextPlaceholder : token.colorText,
          fontSize: 13,
          lineHeight: 1,
          cursor: 'pointer',
          ...style,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            textAlign: 'left',
          }}
        >
          {triggerLabel}
        </span>
        <span
          style={{
            display: 'inline-flex',
            color: token.colorTextTertiary,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 160ms ease',
          }}
        >
          {suffixIcon ?? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path
                d="M2 3.75L5 6.5L8 3.75"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </button>

      <Drawer
        placement="bottom"
        open={open}
        onClose={() => setOpen(false)}
        height="auto"
        closable={false}
        styles={{
          body: { padding: 0 },
          content: {
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            background: token.colorBgContainer,
          },
          mask: { background: 'rgba(15, 18, 22, 0.42)' },
        }}
      >
        <div
          style={{
            padding: '10px 0 0',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '70vh',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 36,
              height: 4,
              borderRadius: 999,
              background: token.colorFillSecondary,
              margin: '0 auto 8px',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 20px 12px',
              gap: 12,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: token.colorText,
              }}
            >
              {title ?? placeholder ?? ''}
            </span>
            {(isMultiple ? props.value.length > 0 : !!props.value) && allowClear && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: token.colorTextTertiary,
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                {t('events_page.clear') || 'Clear'}
              </button>
            )}
          </div>
          {showSearch && (
            <div style={{ padding: '0 16px 10px' }}>
              <Input
                allowClear
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ borderRadius: 999, height: 36 }}
              />
            </div>
          )}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            }}
          >
            {filteredOptions.map((opt) => {
              const checked = selectedValues.includes(opt.value)
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '14px 20px',
                    border: 'none',
                    background: checked ? token.colorFillTertiary : 'transparent',
                    color: token.colorText,
                    fontSize: 15,
                    lineHeight: 1.4,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {opt.label}
                  </span>
                  {checked && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M3 8.5L6.5 12L13 5"
                        stroke={token.colorPrimary}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
            {filteredOptions.length === 0 && (
              <div
                style={{
                  padding: '24px 20px',
                  textAlign: 'center',
                  color: token.colorTextTertiary,
                  fontSize: 14,
                }}
              >
                —
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </>
  )
}
