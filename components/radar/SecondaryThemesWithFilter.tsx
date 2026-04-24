'use client'

import { useMemo, useState } from 'react'
import { Col, Empty, Flex, Row, Segmented, Typography, theme } from 'antd'
import type { ThemeRadarItem } from '@/types/recommendations'
import { useI18n } from '@/lib/i18n-context'
import { ThemeCard } from './ThemeCard'

const { Text } = Typography
const { useToken } = theme

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

  const horizonCounts = useMemo(() => {
    const counts: Record<HorizonKey, number> = { short: 0, medium: 0, long: 0 }
    for (const th of themes) {
      const h = getHorizonFromTheme(th)
      if (h) counts[h] += 1
    }
    return counts
  }, [themes])

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const th of themes) {
      if (!th.category) continue
      counts.set(th.category, (counts.get(th.category) ?? 0) + 1)
    }
    return counts
  }, [themes])

  const topCategories = useMemo(
    () =>
      Array.from(categoryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_CATEGORY_LIMIT)
        .map(([slug]) => slug),
    [categoryCounts],
  )

  const filtered = useMemo(() => {
    return themes.filter((th) => {
      if (horizon !== 'all') {
        const h = getHorizonFromTheme(th)
        if (h !== horizon) return false
      }
      if (category !== 'all' && th.category !== category) return false
      return true
    })
  }, [themes, horizon, category])

  const horizonOptions = [
    { label: `${t('filter.all')} (${themes.length})`, value: 'all' as const },
    { label: `${t('horizon.short')} (${horizonCounts.short})`, value: 'short' as const },
    { label: `${t('horizon.medium')} (${horizonCounts.medium})`, value: 'medium' as const },
    { label: `${t('horizon.long')} (${horizonCounts.long})`, value: 'long' as const },
  ]

  const categoryOptions = [
    { label: `${t('filter.all')} (${themes.length})`, value: 'all' },
    ...topCategories.map((slug) => ({
      label: `${t(`categories.${slug}`) || slug} (${categoryCounts.get(slug) ?? 0})`,
      value: slug,
    })),
  ]

  return (
    <div>
      <Flex vertical gap={10} style={{ marginBottom: 16 }}>
        <Flex align="center" gap={10} wrap>
          <Text
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: token.colorTextTertiary,
              minWidth: 64,
            }}
          >
            {t('filter.horizon')}
          </Text>
          <Segmented
            size="small"
            options={horizonOptions}
            value={horizon}
            onChange={(v) => setHorizon(v as 'all' | HorizonKey)}
          />
        </Flex>
        {categoryOptions.length > 1 && (
          <Flex align="center" gap={10} wrap>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: token.colorTextTertiary,
                minWidth: 64,
              }}
            >
              {t('filter.category')}
            </Text>
            <Segmented
              size="small"
              options={categoryOptions}
              value={category}
              onChange={(v) => setCategory(v as string)}
            />
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

      <Flex justify="flex-end" style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
          {t('themes.tracking_today', { shown: filtered.length, total: themes.length })}
        </Text>
      </Flex>
    </div>
  )
}
