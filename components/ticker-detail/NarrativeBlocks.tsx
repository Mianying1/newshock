'use client'

import { Card, Col, Flex, Row, Typography, theme } from 'antd'
import { useI18n } from '@/lib/i18n-context'
import { fontFamilySystem } from '@/lib/design-tokens'

const { Text, Paragraph } = Typography
const { useToken } = theme

interface Props {
  coreTension: string
  whyBenefits: string
  riskSources: string
  labels: {
    coreTension: string
    whyBenefits: string
    riskSources: string
  }
}

type Variant = 'tension' | 'benefit' | 'risk'

function Block({
  variant,
  label,
  body,
}: {
  variant: Variant
  label: string
  body: string
}) {
  const { token } = useToken()
  const { t } = useI18n()
  const accent =
    variant === 'tension'
      ? token.colorTextTertiary
      : variant === 'benefit'
        ? token.colorSuccess
        : token.colorError
  const icon = variant === 'tension' ? '◆' : variant === 'benefit' ? '↑' : '△'

  return (
    <Card
      size="small"
      style={{
        height: '100%',
        borderLeft: `3px solid ${accent}`,
      }}
      styles={{ body: { padding: 16 } }}
    >
      <Flex align="center" gap={8} style={{ marginBottom: 10 }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: `${accent}1A`,
            color: accent,
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          {icon}
        </span>
        <Text
          style={{
            fontFamily: fontFamilySystem,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'none',
            color: accent,
          }}
        >
          {label}
        </Text>
      </Flex>
      <Paragraph
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.65,
          color: token.colorText,
        }}
        ellipsis={{
          rows: 3,
          expandable: 'collapsible',
          symbol: (expanded) => (expanded ? t('common.collapse') : t('common.expand')),
        }}
      >
        {body}
      </Paragraph>
    </Card>
  )
}

export function NarrativeBlocks({ coreTension, whyBenefits, riskSources, labels }: Props) {
  return (
    <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
      <Col xs={24} md={8}>
        <Block variant="tension" label={labels.coreTension} body={coreTension} />
      </Col>
      <Col xs={24} md={8}>
        <Block variant="benefit" label={labels.whyBenefits} body={whyBenefits} />
      </Col>
      <Col xs={24} md={8}>
        <Block variant="risk" label={labels.riskSources} body={riskSources} />
      </Col>
    </Row>
  )
}
