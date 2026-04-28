'use client'
import useSWR from 'swr'
import {
  Col,
  Divider,
  Flex,
  Progress,
  Row,
  Statistic,
  Typography,
  theme,
} from 'antd'
import { useI18n } from '@/lib/i18n-context'

const { Text, Paragraph } = Typography
const { useToken } = theme

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const SAGE = '#1B7A4F'
const AMBER = '#A8590F'
const CRIMSON = '#9C463B'

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

const DIMS: { key: string; labelKey: string; scoreField: keyof RegimeSnapshot }[] = [
  { key: 'earnings', labelKey: 'market_regime.earnings', scoreField: 'earnings_score' },
  { key: 'credit', labelKey: 'market_regime.credit', scoreField: 'credit_score' },
  { key: 'valuation', labelKey: 'market_regime.valuation', scoreField: 'valuation_score' },
  { key: 'fed', labelKey: 'market_regime.fed', scoreField: 'fed_score' },
  { key: 'economic', labelKey: 'market_regime.economic', scoreField: 'economic_score' },
  { key: 'sentiment', labelKey: 'market_regime.sentiment', scoreField: 'sentiment_score' },
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
  if (score >= 2) return SAGE
  if (score <= 0) return CRIMSON
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

  const pct = (snap.total_score / 12) * 100
  const vk = verdictKey(snap.regime_label)
  const note = t(`market_regime.guidance_text.${snap.configuration_guidance}`)
  const regimeLabel = t(`market_regime.regime_label.${snap.regime_label}`)
  const dotColor = verdictDot(vk)

  return (
    <div style={{ padding: '8px 12px 12px' }}>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ rowGap: 10 }}>
        <Statistic
          title={t('market_regime.composite')}
          value={snap.total_score}
          suffix={
            <Text type="secondary" style={{ fontSize: token.fontSize, fontWeight: 400 }}>
              / 12
            </Text>
          }
          valueStyle={{ fontWeight: 500, fontSize: 32, lineHeight: 1 }}
        />

        <Flex
          align="center"
          gap={6}
          style={{
            padding: '5px 12px 5px 10px',
            borderRadius: 99,
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            flexShrink: 0,
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

      <Progress
        percent={pct}
        showInfo={false}
        size={{ height: 4 }}
        strokeColor={{ '0%': AMBER, '100%': SAGE }}
        trailColor={token.colorFillSecondary}
        style={{ marginTop: 10 }}
      />
      <Paragraph
        type="secondary"
        style={{
          margin: '10px 0 0',
          fontSize: token.fontSize,
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
              <DimensionCell label={t(d.labelKey)} score={score} />
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

function DimensionCell({ label, score }: { label: string; score: number }) {
  const { token } = useToken()
  const percent = (score / 2) * 100
  const color = scoreColor(score)
  const numberColor =
    score === 2 ? token.colorText : score === 0 ? CRIMSON : token.colorTextSecondary

  return (
    <div
      style={{
        padding: '10px 12px 11px',
        background: token.colorFillQuaternary,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusSM,
      }}
    >
      <Text
        style={{
          fontFamily: token.fontFamilyCode,
          fontSize: token.fontSizeSM,
          letterSpacing: '0.1em',
          textTransform: 'none',
          color: token.colorTextTertiary,
          display: 'block',
          lineHeight: 1,
        }}
      >
        {label}
      </Text>
      <Flex align="baseline" gap={3} style={{ marginTop: 8 }}>
        <Text
          style={{
            fontFamily: token.fontFamilyCode,
            fontSize: token.fontSizeHeading4,
            fontWeight: 500,
            color: numberColor,
            lineHeight: 1,
          }}
        >
          {score}
        </Text>
        <Text
          type="secondary"
          style={{
            fontFamily: token.fontFamilyCode,
            fontSize: token.fontSizeSM,
          }}
        >
          /2
        </Text>
      </Flex>
      <Progress
        percent={percent}
        showInfo={false}
        size={{ height: 3 }}
        strokeColor={
          score === 1
            ? { '0%': AMBER, '100%': SAGE }
            : { '0%': color, '100%': color }
        }
        trailColor={token.colorFillSecondary}
        style={{ marginTop: 10 }}
      />
    </div>
  )
}
