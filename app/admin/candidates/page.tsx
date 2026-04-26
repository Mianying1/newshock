'use client'
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Modal,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Typography,
  message,
  theme,
} from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  LinkOutlined,
} from '@ant-design/icons'
import { AdminShell } from '@/components/admin/AdminShell'

const { Text, Paragraph } = Typography
const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Ticker { symbol: string; reasoning?: string }
interface SimilarityWarning {
  type: 'vs_existing' | 'vs_candidate'
  target_id: string
  target_name: string
  similarity_score: number
  reason: string
  recommendation: string
}
interface EvidenceEvent {
  id: string
  headline: string
  source_name: string | null
  source_url: string | null
  event_date: string
}
interface Candidate {
  id: string
  proposed_archetype_id: string
  title: string
  category: string
  description: string
  initial_tickers: Ticker[]
  recent_events: string[]
  evidence_event_ids: string[] | null
  evidence_events: EvidenceEvent[]
  similar_to_existing: string | null
  why_this_matters: string | null
  estimated_importance: 'high' | 'medium' | 'low'
  scan_date: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  theme_group: string | null
  similarity_warnings: SimilarityWarning[] | null
  overall_assessment: string | null
}

function getRecommendation(c: Candidate): {
  type: 'approve' | 'reject' | 'review'
  reason: string
  color: 'success' | 'error' | 'warning'
} {
  const warnings = c.similarity_warnings || []
  if (warnings.length === 0)
    return { type: 'approve', reason: 'No overlap with existing archetypes', color: 'success' }
  const strong = warnings.find((w) => w.recommendation === 'merge_into_target' && w.similarity_score >= 0.75)
  if (strong)
    return {
      type: 'reject',
      reason: `${Math.round(strong.similarity_score * 100)}% overlap with "${strong.target_name}". Core logic already covered.`,
      color: 'error',
    }
  const med = warnings.find((w) => w.recommendation === 'merge_into_target')
  if (med)
    return {
      type: 'review',
      reason: `Possible overlap with "${med.target_name}" (${Math.round(med.similarity_score * 100)}%). Review carefully.`,
      color: 'warning',
    }
  const high = warnings.find((w) => w.recommendation === 'approve_as_new' && w.similarity_score >= 0.75)
  if (high)
    return { type: 'approve', reason: `Related to "${high.target_name}" but distinct angle`, color: 'success' }
  return { type: 'approve', reason: 'Related but independent theme', color: 'success' }
}

export default function CandidatesPage() {
  const { data, mutate, isLoading } = useSWR('/api/admin/candidates', fetcher)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [api, contextHolder] = message.useMessage()
  const { token } = theme.useToken()

  const candidates: Candidate[] = useMemo(() => data?.candidates ?? [], [data])
  const byStatus = useMemo(
    () => ({
      pending: candidates.filter((c) => c.status === 'pending'),
      approved: candidates.filter((c) => c.status === 'approved'),
      rejected: candidates.filter((c) => c.status === 'rejected'),
    }),
    [candidates]
  )
  const filtered = byStatus[filter]
  const grouped = useMemo(
    () =>
      filtered.reduce<Record<string, Candidate[]>>((acc, c) => {
        const g = c.theme_group || 'Other'
        if (!acc[g]) acc[g] = []
        acc[g].push(c)
        return acc
      }, {}),
    [filtered]
  )

  const pendingCounts = useMemo(
    () =>
      candidates.reduce(
        (acc, c) => {
          if (c.status !== 'pending') return acc
          acc[getRecommendation(c).type] = (acc[getRecommendation(c).type] || 0) + 1
          return acc
        },
        { approve: 0, reject: 0, review: 0 } as Record<string, number>
      ),
    [candidates]
  )

  async function approve(id: string) {
    setActioningId(id)
    try {
      const res = await fetch(`/api/admin/candidates/${id}/approve`, { method: 'POST' })
      const result = await res.json()
      if (result.ok) {
        const n = result.new_tickers ?? 0
        const note = result.pipeline_status
          ? `Playbook + logos generating (~30s)`
          : (result.note ?? '')
        api.success({ content: `Approved · +${n} ticker(s) · ${note}`, duration: 6 })
        mutate()
      } else {
        api.error({ content: result.error ?? 'approval failed', duration: 8 })
      }
    } catch (e) {
      api.error({ content: e instanceof Error ? e.message : 'network error' })
    } finally {
      setActioningId(null)
    }
  }

  async function reject(id: string) {
    setActioningId(id)
    try {
      await fetch(`/api/admin/candidates/${id}/reject`, { method: 'POST' })
      api.success('Rejected')
      mutate()
    } finally {
      setActioningId(null)
    }
  }

  function bulkApprove() {
    const targets = candidates.filter((c) => c.status === 'pending' && getRecommendation(c).type === 'approve')
    if (!targets.length) {
      api.info('No candidates recommended for approval')
      return
    }
    Modal.confirm({
      title: `Approve ${targets.length} recommended candidate(s)?`,
      onOk: async () => {
        for (const c of targets) await fetch(`/api/admin/candidates/${c.id}/approve`, { method: 'POST' })
        mutate()
        api.success(`Approved ${targets.length}`)
      },
    })
  }

  function bulkReject() {
    const targets = candidates.filter((c) => c.status === 'pending' && getRecommendation(c).type === 'reject')
    if (!targets.length) {
      api.info('No candidates recommended for rejection')
      return
    }
    Modal.confirm({
      title: `Reject ${targets.length} recommended candidate(s)?`,
      onOk: async () => {
        for (const c of targets) await fetch(`/api/admin/candidates/${c.id}/reject`, { method: 'POST' })
        mutate()
        api.success(`Rejected ${targets.length}`)
      },
    })
  }

  return (
    <AdminShell
      title="Archetype Candidates"
      subtitle="Review new themes from weekly market scan · Approve to create archetype + seed tickers"
    >
      {contextHolder}

      <Tabs
        activeKey={filter}
        onChange={(k) => setFilter(k as typeof filter)}
        tabBarExtraContent={
          filter === 'pending' && (
            <Space>
              <Button
                size="small"
                danger
                disabled={pendingCounts.reject === 0}
                icon={<CloseCircleFilled />}
                onClick={bulkReject}
              >
                Reject all rec ({pendingCounts.reject})
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={pendingCounts.approve === 0}
                icon={<CheckCircleFilled />}
                onClick={bulkApprove}
              >
                Approve all rec ({pendingCounts.approve})
              </Button>
            </Space>
          )
        }
        items={(['pending', 'approved', 'rejected'] as const).map((k) => ({
          key: k,
          label: (
            <span style={{ textTransform: 'capitalize' }}>
              {k} <Text type="secondary">({byStatus[k].length})</Text>
            </span>
          ),
        }))}
      />

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : filtered.length === 0 ? (
        <Empty description={`No ${filter} candidates`} style={{ padding: '40px 0' }} />
      ) : (
        <Flex vertical gap={20}>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <Text
                style={{
                  fontFamily: token.fontFamilyCode,
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: token.colorTextQuaternary,
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                {group} ({items.length})
              </Text>
              <Flex vertical gap={10}>
                {items.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onApprove={() => approve(c.id)}
                    onReject={() => reject(c.id)}
                    isActioning={actioningId === c.id}
                    showActions={filter === 'pending'}
                  />
                ))}
              </Flex>
            </div>
          ))}
        </Flex>
      )}

      <Card size="small" style={{ marginTop: 24 }}>
        <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
          Approval triggers playbook + logo generation automatically (~30s). Re-run failed pipeline:{' '}
          <Text code style={{ fontSize: 11 }}>
            POST /api/admin/archetypes/&lt;id&gt;/run-pipeline
          </Text>
        </Text>
      </Card>
    </AdminShell>
  )
}

function CandidateCard({
  candidate: c,
  onApprove,
  onReject,
  isActioning,
  showActions,
}: {
  candidate: Candidate
  onApprove: () => void
  onReject: () => void
  isActioning: boolean
  showActions: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const { token } = theme.useToken()
  const rec = getRecommendation(c)
  const recIcon =
    rec.type === 'approve' ? <CheckCircleFilled /> : rec.type === 'reject' ? <CloseCircleFilled /> : <ExclamationCircleFilled />
  const recLabel =
    rec.type === 'approve'
      ? 'Recommended: Approve'
      : rec.type === 'reject'
        ? 'Recommended: Reject'
        : 'Needs Review'
  const importanceColor: Record<string, string> =
    { high: 'success', medium: 'warning', low: 'default' }

  return (
    <Card size="small" styles={{ body: { padding: 16 } }}>
      {showActions && (
        <Alert
          showIcon
          icon={recIcon}
          type={rec.color === 'success' ? 'success' : rec.color === 'error' ? 'error' : 'warning'}
          message={recLabel}
          description={rec.reason}
          style={{ marginBottom: 12 }}
        />
      )}

      <Flex justify="space-between" align="flex-start" gap={12}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 15, color: token.colorText }}>
            {c.title}
          </Text>
          <Flex gap={6} wrap style={{ marginTop: 6 }}>
            <Tag bordered={false}>{c.category}</Tag>
            <Tag color={importanceColor[c.estimated_importance]} bordered={false}>
              {c.estimated_importance}
            </Tag>
            <Text style={{ fontSize: 11, color: token.colorTextQuaternary, alignSelf: 'center' }}>
              scanned {c.scan_date}
            </Text>
          </Flex>
        </div>

        {showActions && (
          <Space>
            <Button type="primary" size="small" loading={isActioning} onClick={onApprove}>
              Approve
            </Button>
            <Button size="small" disabled={isActioning} onClick={onReject}>
              Reject
            </Button>
          </Space>
        )}
      </Flex>

      {c.similarity_warnings && c.similarity_warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message={`Similar to ${c.similarity_warnings.length} existing theme(s)`}
          description={
            <Flex vertical gap={8}>
              {c.similarity_warnings.map((w, i) => (
                <div key={i}>
                  <Text strong style={{ fontSize: 12 }}>
                    {w.target_name}
                  </Text>{' '}
                  <Text style={{ fontSize: 11, color: token.colorWarning }}>
                    ({(w.similarity_score * 100).toFixed(0)}% match)
                  </Text>
                  <Paragraph style={{ fontSize: 11, marginTop: 2, marginBottom: 2 }}>{w.reason}</Paragraph>
                  <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                    Suggestion: {w.recommendation.replace(/_/g, ' ')}
                  </Text>
                </div>
              ))}
            </Flex>
          }
        />
      )}

      <Paragraph
        style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: token.colorTextSecondary }}
      >
        {c.description}
      </Paragraph>

      <Button
        type="link"
        size="small"
        style={{ paddingLeft: 0, marginTop: 6 }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Hide details ▲' : 'Show details ▼'}
      </Button>

      {expanded && (
        <Flex
          vertical
          gap={14}
          style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}
        >
          {c.why_this_matters && (
            <Section label="Why this is a theme">
              <Paragraph style={{ fontSize: 13, marginBottom: 0 }}>{c.why_this_matters}</Paragraph>
            </Section>
          )}

          {c.initial_tickers?.length > 0 && (
            <Section label={`Initial tickers (${c.initial_tickers.length})`}>
              <Flex vertical gap={6}>
                {c.initial_tickers.map((t, i) => (
                  <Flex key={i} gap={8} align="flex-start">
                    <Tag style={{ fontFamily: token.fontFamilyCode, margin: 0 }}>${t.symbol}</Tag>
                    <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>{t.reasoning}</Text>
                  </Flex>
                ))}
              </Flex>
            </Section>
          )}

          {c.evidence_events?.length > 0 ? (
            <Section label={`Evidence events (${c.evidence_events.length})`}>
              <Flex vertical gap={8}>
                {c.evidence_events.map((e) => (
                  <div
                    key={e.id}
                    style={{ paddingLeft: 10, borderLeft: `2px solid ${token.colorPrimaryBorder}` }}
                  >
                    {e.source_url ? (
                      <a href={e.source_url} target="_blank" rel="noopener noreferrer">
                        {e.headline} <LinkOutlined style={{ fontSize: 10 }} />
                      </a>
                    ) : (
                      <Text style={{ fontSize: 12 }}>{e.headline}</Text>
                    )}
                    <Text
                      style={{ display: 'block', fontSize: 11, color: token.colorTextQuaternary, marginTop: 2 }}
                    >
                      {e.source_name ?? 'Press'} · {e.event_date}
                    </Text>
                  </div>
                ))}
              </Flex>
            </Section>
          ) : (
            c.recent_events?.length > 0 && (
              <Section label="Recent events (legacy, no IDs)">
                <Flex vertical gap={4}>
                  {c.recent_events.map((e, i) => (
                    <Text
                      key={i}
                      style={{
                        fontSize: 12,
                        color: token.colorTextSecondary,
                        paddingLeft: 10,
                        borderLeft: `2px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      {e}
                    </Text>
                  ))}
                </Flex>
              </Section>
            )
          )}

          {c.similar_to_existing && (
            <Alert
              type="info"
              showIcon
              message={
                <Text style={{ fontSize: 12 }}>
                  Sonnet flagged similarity to <Text code>{c.similar_to_existing}</Text>
                </Text>
              }
            />
          )}

          <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
            Proposed ID: <Text code>{c.proposed_archetype_id}</Text>
          </Text>
        </Flex>
      )}
    </Card>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { token } = theme.useToken()
  return (
    <div>
      <Text
        style={{
          display: 'block',
          fontFamily: token.fontFamilyCode,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: token.colorTextQuaternary,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      {children}
    </div>
  )
}
