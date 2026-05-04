'use client'
import useSWR from 'swr'
import {
  Col,
  Divider,
  Flex,
  Progress,
  Row,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { useI18n } from '@/lib/i18n-context'
import { StructuredTooltipContent } from '@/components/shared/StructuredTooltip'

const { Text, Paragraph } = Typography
const { useToken } = theme

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const SAGE = '#1B7A4F'
const AMBER = '#A8590F'
const CRIMSON = '#9C463B'

const DIM_MAX = 10
const TOTAL_MAX = 60

interface RegimeSnapshot {
  snapshot_date: string
  earnings_score: number
  valuation_score: number
  fed_score: number
  economic_score: number
  credit_score: number
  sentiment_score: number
  total_score: number
  regime_label: string
  regime_label_zh: string | null
  configuration_guidance: string
  configuration_guidance_zh: string | null
}

const DIMS: {
  key: string
  labelKey: string
  descKey: string
  scoreField: keyof RegimeSnapshot
}[] = [
  { key: 'earnings', labelKey: 'market_regime.earnings', descKey: 'market_regime.earnings_desc', scoreField: 'earnings_score' },
  { key: 'credit', labelKey: 'market_regime.credit', descKey: 'market_regime.credit_desc', scoreField: 'credit_score' },
  { key: 'valuation', labelKey: 'market_regime.valuation', descKey: 'market_regime.valuation_desc', scoreField: 'valuation_score' },
  { key: 'fed', labelKey: 'market_regime.fed', descKey: 'market_regime.fed_desc', scoreField: 'fed_score' },
  { key: 'economic', labelKey: 'market_regime.economic', descKey: 'market_regime.economic_desc', scoreField: 'economic_score' },
  { key: 'sentiment', labelKey: 'market_regime.sentiment', descKey: 'market_regime.sentiment_desc', scoreField: 'sentiment_score' },
]

type VerdictKey = 'expansion' | 'stress' | 'bear' | 'neutral'

function verdictKey(label: string): VerdictKey {
  if (label === 'expansion' || label === 'neutral_expansion') return 'expansion'
  if (label === 'stress') return 'stress'
  if (label === 'bear') return 'bear'
  return 'neutral'
}

function verdictDot(vk: VerdictKey): string {
  if (vk === 'expansion') return SAGE
  if (vk === 'stress') return AMBER
  if (vk === 'bear') return CRIMSON
  return '#9A9389'
}

function scoreColor(score: number): string {
  if (score >= 7) return SAGE
  if (score <= 3) return CRIMSON
  return AMBER
}


export function MarketRegimeCard() {
  const { t } = useI18n()
  const { token } = useToken()
  const { data } = useSWR<{ snapshot: RegimeSnapshot | null }>(
    '/api/regime/current',
    fetcher
  )
  const snap = data?.snapshot
  if (!snap) return null

  const totalDisplay = snap.total_score
  const pct = (snap.total_score / TOTAL_MAX) * 100
  const vk = verdictKey(snap.regime_label)
  const note = t(`market_regime.guidance_text.${snap.configuration_guidance}`)
  const regimeLabel = t(`market_regime.regime_label.${snap.regime_label}`)
  const dotColor = verdictDot(vk)
  const totalColor =
    vk === 'expansion' ? SAGE : vk === 'stress' ? AMBER : vk === 'bear' ? CRIMSON : SAGE

  return (
    <div style={{ padding: '8px 12px 12px' }}>
      <Flex align="center" gap={20} wrap>
        <Progress
          type="circle"
          percent={pct}
          size={104}
          strokeWidth={7}
          strokeColor={totalColor}
          trailColor={token.colorFillSecondary}
          format={() => (
            <Text
              style={{
                fontSize: 36,
                fontWeight: 500,
                color: token.colorText,
                fontFamily: token.fontFamilyCode,
                letterSpacing: '-0.03em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {totalDisplay}
            </Text>
          )}
        />
        <Flex vertical gap={8} flex={1} style={{ minWidth: 0 }}>
          <Flex align="baseline" gap={6}>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t('market_regime.composite')}
            </Text>
            <Text
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: 11,
                color: token.colorTextTertiary,
                letterSpacing: '0.02em',
              }}
            >
              / {TOTAL_MAX}
            </Text>
            <Tooltip
              title={<StructuredTooltipContent description={t('market_regime.description')} />}
              placement="top"
              overlayStyle={{ maxWidth: 340 }}
            >
              <InfoCircleOutlined
                style={{
                  fontSize: 12,
                  color: token.colorTextTertiary,
                  cursor: 'pointer',
                }}
              />
            </Tooltip>
          </Flex>
          <Flex
            align="center"
            gap={6}
            style={{
              padding: '5px 12px 5px 10px',
              borderRadius: 99,
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              alignSelf: 'flex-start',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: dotColor,
                display: 'inline-block',
              }}
            />
            <Text
              style={{
                fontSize: token.fontSizeSM,
                color: token.colorText,
                fontWeight: 500,
                letterSpacing: '0.01em',
              }}
            >
              {regimeLabel}
            </Text>
          </Flex>
        </Flex>
      </Flex>

      <Paragraph
        type="secondary"
        style={{
          margin: '14px 0 0',
          fontSize: token.fontSize,
        }}
        ellipsis={{
          rows: 2,
          expandable: 'collapsible',
          symbol: (expanded) => (expanded ? t('common.collapse') : t('common.expand')),
        }}
      >
        {note}
      </Paragraph>

      <Divider style={{ margin: '18px 0 16px' }} />

      <Row gutter={[16, 16]}>
        {DIMS.map((d) => {
          const score = snap[d.scoreField] as number
          return (
            <Col key={d.key} xs={12} sm={12}>
              <DimensionCell
                label={t(d.labelKey)}
                description={t(d.descKey)}
                score={score}
              />
            </Col>
          )
        })}
      </Row>

      <Text
        style={{
          display: 'block',
          marginTop: 14,
          fontSize: token.fontSizeSM,
          color: token.colorTextTertiary,
          textAlign: 'right',
        }}
      >
        {t('market_regime.scores_refresh_twice_weekly')}
      </Text>
    </div>
  )
}

function DimensionCell({
  label,
  description,
  score,
}: {
  label: string
  description: string
  score: number
}) {
  const { token } = useToken()
  const color = scoreColor(score)
  const display = score
  const pct = (score / DIM_MAX) * 100
  const numberColor =
    score >= 7 ? token.colorText : score <= 3 ? CRIMSON : token.colorTextSecondary

  return (
    <div
      style={{
        padding: '12px 12px 13px',
        background: token.colorFillQuaternary,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusSM,
      }}
    >
      <Flex align="center" gap={12}>
        <Progress
          type="circle"
          percent={pct}
          size={52}
          strokeWidth={8}
          strokeColor={color}
          trailColor={token.colorFillSecondary}
          format={() => (
            <Text
              style={{
                fontFamily: token.fontFamilyCode,
                fontSize: token.fontSize,
                fontWeight: 500,
                color: numberColor,
                lineHeight: 1,
              }}
            >
              {display}
            </Text>
          )}
        />
        <Flex vertical gap={4} flex={1} style={{ minWidth: 0 }}>
          <Flex align="center" gap={4}>
            <Text
              style={{
                fontSize: token.fontSizeSM,
                color: token.colorTextSecondary,
                lineHeight: 1.2,
              }}
            >
              {label}
            </Text>
            <Tooltip
              title={<StructuredTooltipContent description={description} />}
              placement="top"
              overlayStyle={{ maxWidth: 340 }}
            >
              <InfoCircleOutlined
                style={{
                  fontSize: 11,
                  color: token.colorTextTertiary,
                  cursor: 'pointer',
                }}
              />
            </Tooltip>
          </Flex>
          <Text
            style={{
              fontFamily: token.fontFamilyCode,
              fontSize: token.fontSizeSM,
              color: token.colorTextTertiary,
              lineHeight: 1,
            }}
          >
            / {DIM_MAX}
          </Text>
        </Flex>
      </Flex>
    </div>
  )
}
