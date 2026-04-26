'use client'
import { useState } from 'react'
import useSWR from 'swr'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Empty,
  Flex,
  List,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
  theme,
} from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import { useI18n } from '@/lib/i18n-context'
import { pickField } from '@/lib/useField'
import { AdminShell } from '@/components/admin/AdminShell'

const { Text, Paragraph, Title } = Typography
const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface SuggestedArchetype {
  name: string
  name_zh: string
  category: string
  description: string
  description_zh: string
  priority: 'high' | 'medium' | 'low'
  reasoning: string
  suggested_tickers: string[]
  covers_unmatched_events?: string[]
  duration_type: 'extended' | 'bounded' | 'dependent'
}
interface SuggestedMerger {
  existing_archetype_ids: string[]
  proposed_umbrella_name: string
  proposed_umbrella_name_zh: string
  reasoning: string
}
interface SuggestedRebalancing { observation: string; recommendation: string }
interface AuditAction { type: string; date: string; payload?: Record<string, unknown> }
interface AuditReport {
  id: string
  report_date: string
  active_archetype_count: number
  unmatched_events_count: number
  market_regime_label: string | null
  market_regime_score: number | null
  overall_assessment: string
  overall_assessment_zh: string
  suggested_new_archetypes: SuggestedArchetype[]
  suggested_mergers: SuggestedMerger[]
  suggested_rebalancing: SuggestedRebalancing[]
  actions_taken: AuditAction[]
  admin_reviewed_at: string | null
  admin_notes: string | null
  created_at: string
}
interface HistoryRow {
  id: string
  report_date: string
  active_archetype_count: number
  actions_taken: AuditAction[]
}
interface ResponsePayload { latest: AuditReport | null; history: HistoryRow[] }

const PRIORITY_COLOR: Record<string, string> = { high: 'error', medium: 'warning', low: 'default' }

export default function CoverageAuditPage() {
  const { data, mutate, isLoading } = useSWR<ResponsePayload>('/api/admin/coverage-audit', fetcher)
  const { locale } = useI18n()
  const [busy, setBusy] = useState<string | null>(null)
  const [api, contextHolder] = message.useMessage()
  const { token } = theme.useToken()

  const latest = data?.latest ?? null
  const history = data?.history ?? []

  async function recordAction(
    key: string,
    reportId: string,
    action_type: AuditAction['type'],
    payload?: Record<string, unknown>
  ) {
    setBusy(key)
    try {
      const res = await fetch('/api/admin/coverage-audit/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: reportId, action_type, payload }),
      })
      const result = await res.json()
      if (result.ok) {
        api.success(`Action recorded: ${action_type}`)
        mutate()
      } else {
        api.error(`Error: ${result.error ?? 'unknown'}`)
      }
    } catch (e) {
      api.error(e instanceof Error ? e.message : 'network error')
    } finally {
      setBusy(null)
    }
  }

  async function createArchetype(index: number, spec: SuggestedArchetype) {
    if (!latest) return
    const key = `create-${index}`
    setBusy(key)
    try {
      const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
      const res = await fetch('/api/admin/archetypes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slug,
          name: spec.name,
          category: spec.category,
          description: spec.description,
          trigger_keywords: [],
          typical_tickers: spec.suggested_tickers.map((s) => ({ symbol: s })),
          confidence_level: 'medium',
          notes: `Created from coverage audit ${latest.report_date}. Reasoning: ${spec.reasoning}`,
          spawn_theme: {
            name_zh: spec.name_zh,
            description_zh: spec.description_zh,
            priority: spec.priority,
            suggested_tickers: spec.suggested_tickers,
            covers_unmatched_events: spec.covers_unmatched_events ?? [],
            report_id: latest.id,
          },
        }),
      })
      const result = await res.json()
      if (res.ok && (result.ok || result.id)) {
        const bits: string[] = []
        if (result.theme_id) bits.push(`theme ${String(result.theme_id).slice(0, 8)}`)
        if (typeof result.recs_count === 'number') bits.push(`${result.recs_count} recs`)
        if (typeof result.events_linked === 'number' && result.events_linked > 0) bits.push(`${result.events_linked} events linked`)
        if (result.enrich_ok === true && typeof result.enrich_kept === 'number') bits.push(`enriched ${result.enrich_kept} tickers`)
        else if (result.enrich_ok === false && result.enrich_error) bits.push(`enrich failed`)
        const failed: string[] = Array.isArray(result.failed_tickers) ? result.failed_tickers : []
        const failedSuffix = failed.length > 0 ? ` · skipped: ${failed.join(', ')}` : ''
        const msg = bits.length > 0 ? `Archetype + ${bits.join(', ')} created${failedSuffix}` : `Archetype created`
        await recordAction(key, latest.id, 'archetype_created', {
          index,
          archetype_id: result.id ?? slug,
          name: spec.name,
          theme_id: result.theme_id ?? null,
          recs_count: result.recs_count ?? null,
          events_linked: result.events_linked ?? null,
          failed_tickers: failed,
          spawn_error: result.spawn_error ?? null,
        })
        api.success({ content: msg, duration: 7 })
      } else {
        api.error(`Create failed: ${result.error ?? `HTTP ${res.status}`}`)
      }
    } catch (e) {
      api.error(e instanceof Error ? e.message : 'network error')
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) {
    return (
      <AdminShell title="Coverage Audit" subtitle="Archetype coverage + suggestions">
        <Skeleton active paragraph={{ rows: 8 }} />
      </AdminShell>
    )
  }

  if (!latest) {
    return (
      <AdminShell title="Coverage Audit" subtitle="Archetype coverage + suggestions">
        <Empty
          description={
            <Space direction="vertical" size={2}>
              <Text>No audits yet.</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Run with <Text code>npx tsx scripts/run-coverage-audit.ts</Text>
              </Text>
            </Space>
          }
          style={{ padding: '40px 0' }}
        />
      </AdminShell>
    )
  }

  const actionsByKind = new Map<string, AuditAction[]>()
  for (const a of latest.actions_taken ?? []) {
    const arr = actionsByKind.get(a.type) ?? []
    arr.push(a)
    actionsByKind.set(a.type, arr)
  }
  const hasAction = (kind: string, index: number): boolean =>
    (actionsByKind.get(kind) ?? []).some((a) => (a.payload as { index?: number } | undefined)?.index === index)

  return (
    <AdminShell
      title={`Coverage Audit · Week of ${latest.report_date}`}
      subtitle={`Library: ${latest.active_archetype_count} archetypes · Regime: ${latest.market_regime_label ?? 'n/a'}${
        latest.market_regime_score != null ? ` · ${latest.market_regime_score}/12` : ''
      } · Unmatched (14d): ${latest.unmatched_events_count}`}
      maxWidth={1100}
    >
      {contextHolder}

      <Flex vertical gap={20}>
        {/* Overall assessment */}
        <SectionLabel>Overall Assessment</SectionLabel>
        <Card size="small">
          <Paragraph style={{ marginBottom: 0, fontSize: 14 }}>
            {pickField(locale, latest.overall_assessment, latest.overall_assessment_zh)}
          </Paragraph>
          {locale === 'zh' && latest.overall_assessment && (
            <Paragraph
              style={{
                marginTop: 12,
                marginBottom: 0,
                paddingTop: 12,
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                fontSize: 12,
                color: token.colorTextTertiary,
              }}
            >
              {latest.overall_assessment}
            </Paragraph>
          )}
        </Card>

        {/* Suggested new archetypes */}
        <SectionLabel>Suggested New Archetypes ({latest.suggested_new_archetypes.length})</SectionLabel>
        {latest.suggested_new_archetypes.length === 0 ? (
          <Empty description="Library looks sufficient — no proposals." imageStyle={{ height: 40 }} />
        ) : (
          <Flex vertical gap={10}>
            {latest.suggested_new_archetypes.map((spec, i) => {
              const created = hasAction('archetype_created', i)
              const rejected = hasAction('archetype_rejected', i)
              const done = created || rejected
              return (
                <Card
                  key={i}
                  size="small"
                  style={{ opacity: done ? 0.6 : 1 }}
                  styles={{ body: { padding: 16 } }}
                >
                  <Flex justify="space-between" align="flex-start" gap={12}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Flex gap={6} wrap style={{ marginBottom: 6 }}>
                        <Tag color={PRIORITY_COLOR[spec.priority] ?? 'default'} bordered={false}>
                          {spec.priority}
                        </Tag>
                        <Tag bordered={false}>{spec.category}</Tag>
                        <Tag bordered={false}>{spec.duration_type}</Tag>
                        {created && (
                          <Tag color="success" bordered={false} icon={<CheckCircleFilled />}>
                            Created
                          </Tag>
                        )}
                        {rejected && <Tag bordered={false}>Rejected</Tag>}
                      </Flex>
                      <Text strong style={{ fontSize: 15 }}>
                        {pickField(locale, spec.name, spec.name_zh)}
                      </Text>
                      {locale === 'zh' && spec.name && (
                        <Text style={{ display: 'block', fontSize: 12, color: token.colorTextTertiary }}>
                          {spec.name}
                        </Text>
                      )}
                    </div>
                    {!done && (
                      <Space>
                        <Button
                          type="primary"
                          size="small"
                          loading={busy === `create-${i}`}
                          disabled={busy !== null && busy !== `create-${i}`}
                          onClick={() => createArchetype(i, spec)}
                        >
                          Create Archetype
                        </Button>
                        <Button
                          size="small"
                          disabled={busy !== null}
                          onClick={() =>
                            recordAction(`reject-${i}`, latest.id, 'archetype_rejected', {
                              index: i,
                              name: spec.name,
                            })
                          }
                        >
                          Reject
                        </Button>
                      </Space>
                    )}
                  </Flex>

                  <Paragraph style={{ marginTop: 10, marginBottom: 8, fontSize: 13 }}>
                    {pickField(locale, spec.description, spec.description_zh)}
                  </Paragraph>
                  <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    <Text strong style={{ fontSize: 12 }}>Why: </Text>
                    {spec.reasoning}
                  </Text>

                  {spec.suggested_tickers?.length > 0 && (
                    <Flex gap={4} wrap style={{ marginTop: 10 }}>
                      {spec.suggested_tickers.map((t) => (
                        <a key={t} href={`/tickers/${t}`}>
                          <Tag style={{ fontFamily: token.fontFamilyCode, margin: 0 }}>${t}</Tag>
                        </a>
                      ))}
                    </Flex>
                  )}

                  {spec.covers_unmatched_events && spec.covers_unmatched_events.length > 0 && (
                    <Collapse
                      ghost
                      size="small"
                      style={{ marginTop: 8 }}
                      items={[
                        {
                          key: 'evt',
                          label: (
                            <Text style={{ fontSize: 12 }}>
                              Covers {spec.covers_unmatched_events.length} unmatched event(s)
                            </Text>
                          ),
                          children: (
                            <Flex vertical gap={2}>
                              {spec.covers_unmatched_events.map((id) => (
                                <Text
                                  key={id}
                                  style={{
                                    fontFamily: token.fontFamilyCode,
                                    fontSize: 11,
                                    color: token.colorTextTertiary,
                                  }}
                                >
                                  {id}
                                </Text>
                              ))}
                            </Flex>
                          ),
                        },
                      ]}
                    />
                  )}
                </Card>
              )
            })}
          </Flex>
        )}

        {/* Suggested mergers */}
        <SectionLabel>Suggested Mergers ({latest.suggested_mergers.length})</SectionLabel>
        {latest.suggested_mergers.length === 0 ? (
          <Empty description="No merger candidates." imageStyle={{ height: 40 }} />
        ) : (
          <Flex vertical gap={10}>
            {latest.suggested_mergers.map((m, i) => {
              const approved = hasAction('merger_approved', i)
              const rejected = hasAction('merger_rejected', i)
              const done = approved || rejected
              return (
                <Card key={i} size="small" style={{ opacity: done ? 0.6 : 1 }}>
                  <Flex justify="space-between" align="flex-start" gap={12}>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 15 }}>
                        {pickField(locale, m.proposed_umbrella_name, m.proposed_umbrella_name_zh)}
                      </Text>
                      <Text style={{ display: 'block', fontSize: 12, color: token.colorTextTertiary, marginTop: 4 }}>
                        Merges:{' '}
                        {m.existing_archetype_ids.map((id, idx) => (
                          <span key={id}>
                            {idx > 0 && ' · '}
                            <Text code style={{ fontSize: 11 }}>{id}</Text>
                          </span>
                        ))}
                      </Text>
                    </div>
                    {!done && (
                      <Space>
                        <Button
                          type="primary"
                          size="small"
                          disabled={busy !== null}
                          onClick={() =>
                            recordAction(`merge-approve-${i}`, latest.id, 'merger_approved', { index: i, ...m })
                          }
                        >
                          Approve Merge
                        </Button>
                        <Button
                          size="small"
                          disabled={busy !== null}
                          onClick={() =>
                            recordAction(`merge-reject-${i}`, latest.id, 'merger_rejected', { index: i })
                          }
                        >
                          Reject
                        </Button>
                      </Space>
                    )}
                  </Flex>
                  <Paragraph style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>{m.reasoning}</Paragraph>
                  {approved && (
                    <Alert
                      type="success"
                      showIcon
                      style={{ marginTop: 10 }}
                      message="Approved — apply merge manually in theme_archetypes."
                    />
                  )}
                </Card>
              )
            })}
          </Flex>
        )}

        {/* Rebalancing */}
        <SectionLabel>Rebalancing Notes ({latest.suggested_rebalancing.length})</SectionLabel>
        {latest.suggested_rebalancing.length === 0 ? (
          <Empty description="No rebalancing notes." imageStyle={{ height: 40 }} />
        ) : (
          <Flex vertical gap={8}>
            {latest.suggested_rebalancing.map((r, i) => (
              <Card key={i} size="small">
                <Text style={{ fontSize: 13 }}>
                  <Text strong>Observation: </Text>
                  {r.observation}
                </Text>
                <Paragraph style={{ marginTop: 6, marginBottom: 0, fontSize: 13 }}>
                  <Text strong>Recommendation: </Text>
                  {r.recommendation}
                </Paragraph>
              </Card>
            ))}
          </Flex>
        )}

        {/* History */}
        <SectionLabel>Audit History</SectionLabel>
        {history.length === 0 ? (
          <Empty description="No prior audits." imageStyle={{ height: 40 }} />
        ) : (
          <List
            size="small"
            bordered
            dataSource={history}
            renderItem={(h) => {
              const counts = (h.actions_taken ?? []).reduce<Record<string, number>>((acc, a) => {
                acc[a.type] = (acc[a.type] ?? 0) + 1
                return acc
              }, {})
              return (
                <List.Item>
                  <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                    <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 12 }}>{h.report_date}</Text>
                    <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
                      {h.active_archetype_count} archetypes ·{' '}
                      {Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'no actions'}
                    </Text>
                  </Flex>
                </List.Item>
              )
            }}
          />
        )}
      </Flex>
    </AdminShell>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken()
  return (
    <Text
      style={{
        fontFamily: token.fontFamilyCode,
        fontSize: 11,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: token.colorTextQuaternary,
        marginTop: 4,
      }}
    >
      {children}
    </Text>
  )
}
