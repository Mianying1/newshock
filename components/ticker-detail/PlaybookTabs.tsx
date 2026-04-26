'use client'

import { useState } from 'react'
import { Flex, Tabs, Typography, theme } from 'antd'

const { Text, Paragraph } = Typography
const { useToken } = theme

export interface PlaybookHistoricalCase {
  year: string | number | null
  name: string
  result: string | null
}

export interface PlaybookData {
  themeId: string
  themeLabel: string
  archetypeId: string | null
  observation: string | null
  historicalCases: PlaybookHistoricalCase[]
  exitSignals: string[]
}

interface Labels {
  observation: string
  historicalCases: string
  exitSignals: string
}

interface Props {
  playbooks: PlaybookData[]
  labels: Labels
}

function SubSection({
  label,
  accent,
  children,
}: {
  label: string
  accent: string
  children: React.ReactNode
}) {
  const { token } = useToken()
  return (
    <div
      style={{
        paddingLeft: 14,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <Text
        style={{
          display: 'block',
          fontSize: 14,
          fontWeight: 600,
          color: token.colorText,
          letterSpacing: '-0.005em',
          marginBottom: 10,
        }}
      >
        {label}
      </Text>
      {children}
    </div>
  )
}

function PlaybookBody({ pb, labels }: { pb: PlaybookData; labels: Labels }) {
  const { token } = useToken()

  return (
    <Flex vertical gap={28} style={{ paddingTop: 8 }}>
      {pb.observation && (
        <SubSection label={labels.observation} accent={token.colorTextTertiary}>
          <Paragraph
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.7,
              color: token.colorText,
            }}
          >
            {pb.observation}
          </Paragraph>
        </SubSection>
      )}

      {pb.historicalCases.length > 0 && (
        <SubSection label={labels.historicalCases} accent={token.colorTextSecondary}>
          <Flex vertical gap={10}>
            {pb.historicalCases.slice(0, 3).map((c, i) => (
              <div key={`${c.name}-${i}`} style={{ lineHeight: 1.6 }}>
                <Text
                  style={{
                    fontFamily: token.fontFamilyCode,
                    fontSize: 12,
                    color: token.colorTextTertiary,
                    fontVariantNumeric: 'tabular-nums',
                    marginRight: 8,
                  }}
                >
                  {c.year ?? '—'}
                </Text>
                <Text strong style={{ fontSize: 13, color: token.colorText }}>
                  {c.name}
                </Text>
                {c.result && (
                  <>
                    <Text
                      style={{
                        fontSize: 13,
                        margin: '0 6px',
                        color: token.colorTextQuaternary,
                      }}
                    >
                      ·
                    </Text>
                    <Text style={{ fontSize: 13, color: token.colorTextSecondary }}>
                      {c.result}
                    </Text>
                  </>
                )}
              </div>
            ))}
          </Flex>
        </SubSection>
      )}

      {pb.exitSignals.length > 0 && (
        <SubSection label={labels.exitSignals} accent={token.colorWarning}>
          <Flex vertical gap={6}>
            {pb.exitSignals.slice(0, 5).map((s, i) => (
              <Flex key={`${s}-${i}`} align="baseline" gap={8}>
                <Text
                  style={{
                    fontSize: 13,
                    color: token.colorWarning,
                    lineHeight: 1,
                  }}
                >
                  •
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: token.colorText,
                    lineHeight: 1.6,
                  }}
                >
                  {s}
                </Text>
              </Flex>
            ))}
          </Flex>
        </SubSection>
      )}
    </Flex>
  )
}

export function PlaybookTabs({ playbooks, labels }: Props) {
  const { token } = useToken()
  const [activeKey, setActiveKey] = useState<string>(
    playbooks[0]?.themeId ?? '',
  )

  if (playbooks.length === 0) return null

  const sameArchetype =
    playbooks.length > 1 &&
    playbooks.every(
      (p) => p.archetypeId && p.archetypeId === playbooks[0].archetypeId,
    )

  if (playbooks.length === 1 || sameArchetype) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: '20px 22px 24px',
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
        }}
      >
        <PlaybookBody pb={playbooks[0]} labels={labels} />
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 12,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        padding: '6px 22px 24px',
      }}
    >
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        items={playbooks.map((pb) => ({
          key: pb.themeId,
          label: pb.themeLabel,
          children: <PlaybookBody pb={pb} labels={labels} />,
        }))}
        tabBarStyle={{ marginBottom: 18 }}
      />
    </div>
  )
}
