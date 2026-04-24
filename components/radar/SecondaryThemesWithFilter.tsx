'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Col, Empty, Flex, Row, Typography, theme } from 'antd'
import { PlusOutlined, MinusOutlined } from '@ant-design/icons'
import type { ThemeRadarItem } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { ThemeCard } from './ThemeCard'

const { Text } = Typography
const { useToken } = theme

interface FilterPillProps {
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function FilterPill({ label, count, active, onClick }: FilterPillProps) {
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
    </button>
  )
}

type HorizonKey = 'short' | 'medium' | 'long'

interface SecondaryThemesWithFilterProps {
  themes: ThemeRadarItem[]
}

function getHorizonFromTheme(th: ThemeRadarItem): HorizonKey | null {
  const upper = th.archetype_playbook?.typical_duration_days_approx?.[1]
  if (typeof upper !== 'number' || upper <= 0) return null
  if (upper <= 90) return 'short'
  if (upper <= 365) return 'medium'
  return 'long'
}

const TOP_CATEGORY_LIMIT = 6

export function SecondaryThemesWithFilter({ themes }: SecondaryThemesWithFilterProps) {
  const { t } = useI18n()
  const { token } = useToken()
  const [horizon, setHorizon] = useState<'all' | HorizonKey>('all')
  const [category, setCategory] = useState<'all' | string>('all')
  const [showLowSignal, setShowLowSignal] = useState(false)

  const anchorRef = useRef<HTMLDivElement>(null)
  const anchorScroll = useCallback(() => {
    requestAnimationFrame(() => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const target = window.scrollY + rect.top - 60
      if (Math.abs(window.scrollY - target) > 4) {
        window.scrollTo({ top: target, behavior: 'auto' })
      }
    })
  }, [])
  const pickHorizon = (v: 'all' | HorizonKey) => {
    setHorizon(v)
    anchorScroll()
  }
  const pickCategory = (v: 'all' | string) => {
    setCategory(v)
    anchorScroll()
  }
  const pickSignal = (checked: boolean) => {
    setShowLowSignal(checked)
    anchorScroll()
  }

  const isLowSignal = (th: ThemeRadarItem) => (th.event_count ?? 0) <= 1
  const lowSignalCount = useMemo(() => themes.filter(isLowSignal).length, [themes])
  const matureThemes = useMemo(() => themes.filter((th) => !isLowSignal(th)), [themes])
  const basePool = showLowSignal ? themes : matureThemes

  const horizonCounts = useMemo(() => {
    const counts: Record<HorizonKey, number> = { short: 0, medium: 0, long: 0 }
    for (const th of basePool) {
      const h = getHorizonFromTheme(th)
      if (h) counts[h] += 1
    }
    return counts
  }, [basePool])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const th of basePool) {
      if (!th.category) continue
      counts.set(th.category, (counts.get(th.category) ?? 0) + 1)
    }
    return counts
  }, [basePool])

  const topCategories = useMemo(
    () =>
      Array.from(categoryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_CATEGORY_LIMIT)
        .map(([slug]) => slug),
    [categoryCounts],
  )

  const filtered = useMemo(() => {
    return basePool.filter((th) => {
      if (horizon !== 'all') {
        const h = getHorizonFromTheme(th)
        if (h !== horizon) return false
      }
      if (category !== 'all' && th.category !== category) return false
      return true
    })
  }, [basePool, horizon, category])

  const hasCategory = topCategories.length > 0

  return (
    <div ref={anchorRef} style={{ scrollMarginTop: 60 }}>
      <Flex vertical gap={10} style={{ marginBottom: 18 }}>
        <Flex gap={8} wrap align="center" justify="space-between">
          <Flex gap={8} wrap>
            <FilterPill
              label={t('filter.all')}
              count={basePool.length}
              active={horizon === 'all'}
              onClick={() => pickHorizon('all')}
            />
            <FilterPill
              label={t('horizon.short')}
              count={horizonCounts.short}
              active={horizon === 'short'}
              onClick={() => pickHorizon('short')}
            />
            <FilterPill
              label={t('horizon.medium')}
              count={horizonCounts.medium}
              active={horizon === 'medium'}
              onClick={() => pickHorizon('medium')}
            />
            <FilterPill
              label={t('horizon.long')}
              count={horizonCounts.long}
              active={horizon === 'long'}
              onClick={() => pickHorizon('long')}
            />
          </Flex>
          {lowSignalCount > 0 && (
            <button
              type="button"
              onClick={() => pickSignal(!showLowSignal)}
              className="filter-lowsignal-toggle"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 28,
                padding: '0 10px',
                border: 'none',
                background: 'transparent',
                color: token.colorTextTertiary,
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1,
                cursor: 'pointer',
                borderRadius: 6,
                transition: 'color 160ms ease, background-color 160ms ease',
              }}
            >
              {showLowSignal ? <MinusOutlined style={{ fontSize: 10 }} /> : <PlusOutlined style={{ fontSize: 10 }} />}
              <span>
                {showLowSignal
                  ? t('filter.hide_low_signal', { count: lowSignalCount })
                  : t('filter.show_low_signal', { count: lowSignalCount })}
              </span>
            </button>
          )}
        </Flex>
        {hasCategory && (
          <Flex gap={8} wrap>
            <FilterPill
              label={t('filter.all')}
              count={basePool.length}
              active={category === 'all'}
              onClick={() => pickCategory('all')}
            />
            {topCategories.map((slug) => (
              <FilterPill
                key={slug}
                label={t(`categories.${slug}`) || slug}
                count={categoryCounts.get(slug) ?? 0}
                active={category === slug}
                onClick={() => pickCategory(slug)}
              />
            ))}
          </Flex>
        )}
      </Flex>

      {filtered.length === 0 ? (
        <Empty description={t('themes.no_results')} style={{ padding: '40px 0' }} />
      ) : (
        <Row gutter={[14, 14]}>
          {filtered.map((th) => (
            <Col key={th.id} xs={24} sm={12} lg={8} xl={6}>
              <ThemeCard theme={th} variant="secondary" />
            </Col>
          ))}
        </Row>
      )}

      <Flex justify="space-between" align="center" style={{ marginTop: 14 }} gap={12}>
        <Text type="secondary" style={{ fontSize: 12, color: token.colorTextQuaternary }}>
          {lowSignalCount > 0
            ? showLowSignal
              ? t('filter.showing_all')
              : t('filter.hidden_low_signal', { count: lowSignalCount })
            : ''}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('themes.tracking_today', { shown: filtered.length, total: themes.length })}
        </Text>
      </Flex>
    </div>
  )
}
