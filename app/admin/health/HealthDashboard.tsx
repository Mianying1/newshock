'use client'

import Link from 'next/link'
import {
  Alert,
  Card,
  Col,
  Empty,
  Flex,
  Progress,
  Row,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  ExclamationCircleFilled,
} from '@ant-design/icons'
import { AdminShell } from '@/components/admin/AdminShell'
import CronTriggers from './CronTriggers'

const { Text } = Typography

const DAY_MS = 86400000
const HOUR_MS = 3600000

interface CoverageFigure {
  filled: number
  total: number
}
interface CronCheckRow {
  path: string
  schedule: string
  last_run_iso: string | null
  proxy_label: string
  stale: boolean
}
interface SentimentShiftRow {
  theme_id: string
  theme_name: string
  sentiment_score: number | null
  dominant_sentiment: string | null
  direction: string | null
  last_shift_days_ago: number | null
}

interface HealthData {
  errors: { total: number; hourly: Array<[string, number]> }
  coverage: {
    level_of_impact: CoverageFigure
    supports_or_contradicts: CoverageFigure
    exposure_type: CoverageFigure
  }
  volume: {
    events: { d1: number; d7: number }
    themes: { d1: number; d7: number }
    counter_evidence: { d1: number; d7: number }
  }
  cronStatus: CronCheckRow[]
  conviction: { total: number; scored: number; last: string | null }
  counter: CoverageFigure & {
    all_events: number
    supports: number
    contradicts: number
    neutral: number
  }
  alerts: string[]
  themeAlerts24h: { total: number; critical: number; warn: number; info: number }
  sentimentShifts: { rows: SentimentShiftRow[] }
}

interface Props {
  generatedAt: string
  crons: { path: string; schedule: string }[]
  manualTriggersEnabled: boolean
  data: HealthData
}

function pct(n: number, d: number): number {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10
}

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < HOUR_MS) return `${Math.round(ms / 60000)}m ago`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h ago`
  return `${Math.round(ms / DAY_MS)}d ago`
}

function CoverageBar({ label, filled, total }: { label: string; filled: number; total: number }) {
  const { token } = theme.useToken()
  const fillPct = total ? Math.round((filled / total) * 1000) / 10 : 0
  const color =
    fillPct < 50 ? token.colorError : fillPct < 80 ? token.colorWarning : token.colorSuccess
  return (
    <div>
      <Flex justify="space-between" align="baseline" style={{ marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>{label}</Text>
        <Text style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: token.colorTextTertiary }}>
          {filled}/{total} · NULL {pct(total - filled, total)}%
        </Text>
      </Flex>
      <Progress percent={fillPct} showInfo={false} strokeColor={color} size="small" />
    </div>
  )
}

export default function HealthDashboard({ generatedAt, crons, manualTriggersEnabled, data }: Props) {
  const { token } = theme.useToken()
  const { errors, coverage, volume, cronStatus, conviction, counter, alerts, themeAlerts24h, sentimentShifts } = data

  return (
    <AdminShell
      title="Health Dashboard"
      subtitle="Pipeline · crons · coverage · alerts"
      meta={
        <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 11, color: token.colorTextQuaternary }}>
          {generatedAt} UTC
        </Text>
      }
    >
      <Flex vertical gap={16}>
        {/* 1. Alerts */}
        <Card
          size="small"
          title={
            <Flex align="center" gap={8}>
              <span>1 · Alerts</span>
              {alerts.length === 0 ? (
                <Tag color="success" bordered={false} icon={<CheckCircleFilled />}>
                  all clear
                </Tag>
              ) : (
                <Tag color="error" bordered={false} icon={<CloseCircleFilled />}>
                  {alerts.length} firing
                </Tag>
              )}
            </Flex>
          }
        >
          {alerts.length === 0 ? (
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>No thresholds breached.</Text>
          ) : (
            <Flex vertical gap={6}>
              {alerts.map((a, i) => (
                <Alert key={i} type="error" showIcon message={a} style={{ padding: '6px 12px' }} />
              ))}
            </Flex>
          )}
        </Card>

        {/* 2. Classifier errors */}
        <Card
          size="small"
          title={
            <Flex align="center" gap={8}>
              <span>2 · Classifier Errors (24h)</span>
              <Tag
                color={errors.total === 0 ? 'success' : errors.total > 10 ? 'error' : 'warning'}
                bordered={false}
              >
                {errors.total}
              </Tag>
            </Flex>
          }
        >
          {errors.hourly.length === 0 ? (
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>
              No classifier errors in last 24h.
            </Text>
          ) : (
            <Table
              size="small"
              pagination={false}
              dataSource={errors.hourly.map(([h, c]) => ({ key: h, hour: h, count: c }))}
              columns={[
                { title: 'Hour (UTC)', dataIndex: 'hour' },
                { title: 'Errors', dataIndex: 'count', align: 'right', width: 100 },
              ]}
            />
          )}
        </Card>

        {/* 3. Field coverage */}
        <Card size="small" title="3 · Field Coverage">
          <Flex vertical gap={14}>
            <CoverageBar
              label="events.level_of_impact"
              filled={coverage.level_of_impact.filled}
              total={coverage.level_of_impact.total}
            />
            <CoverageBar
              label="events.supports_or_contradicts (of events with theme)"
              filled={coverage.supports_or_contradicts.filled}
              total={coverage.supports_or_contradicts.total}
            />
            <CoverageBar
              label="theme_recommendations.exposure_type"
              filled={coverage.exposure_type.filled}
              total={coverage.exposure_type.total}
            />
          </Flex>
        </Card>

        {/* 4. Pipeline volume */}
        <Card size="small" title="4 · Pipeline Volume">
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="Events · 24h" value={volume.events.d1} />
              <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
                7d: {volume.events.d7}
              </Text>
            </Col>
            <Col span={8}>
              <Statistic title="Themes · 24h" value={volume.themes.d1} />
              <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
                7d: {volume.themes.d7}
              </Text>
            </Col>
            <Col span={8}>
              <Statistic title="Counter-Ev · 24h" value={volume.counter_evidence.d1} />
              <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
                7d: {volume.counter_evidence.d7}
              </Text>
            </Col>
          </Row>
        </Card>

        {/* 5. Cron status */}
        <Card size="small" title="5 · Cron Status">
          <CronStatusTable rows={cronStatus} />
        </Card>

        {/* 6. Conviction */}
        <Card
          size="small"
          title={
            <Flex align="center" gap={8}>
              <span>6 · Conviction Coverage</span>
              <Tag
                color={
                  conviction.total && conviction.scored === conviction.total
                    ? 'success'
                    : conviction.scored === 0
                      ? 'error'
                      : 'warning'
                }
                bordered={false}
              >
                {conviction.scored}/{conviction.total}
              </Tag>
            </Flex>
          }
        >
          <Flex vertical gap={4}>
            <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
              Scored: <b>{conviction.scored}</b> / {conviction.total} active themes (
              {pct(conviction.scored, conviction.total)}%)
            </Text>
            <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
              <ClockCircleOutlined /> Most recent: {relTime(conviction.last)}
            </Text>
            <Text style={{ fontSize: 11, color: token.colorTextQuaternary, marginTop: 4 }}>
              Scope: status=&apos;active&apos; only · exploratory/cooling/archived not scored.
            </Text>
          </Flex>
        </Card>

        {/* 7. Counter-evidence */}
        <Card
          size="small"
          title={
            <Flex align="center" gap={8}>
              <span>7 · Counter-Evidence Coverage</span>
              <Tag color={counter.filled === counter.total ? 'success' : 'warning'} bordered={false}>
                {counter.filled}/{counter.total}
              </Tag>
            </Flex>
          }
        >
          <Flex vertical gap={4}>
            <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
              Classified: <b>{counter.filled}</b> / {counter.total} events with theme (
              {pct(counter.filled, counter.total)}%)
            </Text>
            <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
              Denominator = events with trigger_theme_id ({counter.total}) · not all events (
              {counter.all_events}).
            </Text>
            <Flex gap={16} style={{ marginTop: 6 }}>
              <Tag bordered={false} color="success">
                ↑ supports {counter.supports}
              </Tag>
              <Tag bordered={false} color="error">
                ↓ contradicts {counter.contradicts}
              </Tag>
              <Tag bordered={false}>· neutral {counter.neutral}</Tag>
            </Flex>
          </Flex>
        </Card>

        {/* 8. Theme alerts 24h */}
        <Card
          size="small"
          title={
            <Flex align="center" gap={8}>
              <span>8 · Theme Alerts (24h)</span>
              <Tag
                color={
                  themeAlerts24h.total === 0
                    ? 'success'
                    : themeAlerts24h.critical > 0
                      ? 'error'
                      : themeAlerts24h.warn > 0
                        ? 'warning'
                        : 'processing'
                }
                bordered={false}
              >
                {themeAlerts24h.total}
              </Tag>
            </Flex>
          }
        >
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="critical"
                value={themeAlerts24h.critical}
                valueStyle={{ color: token.colorError }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="warn"
                value={themeAlerts24h.warn}
                valueStyle={{ color: token.colorWarning }}
              />
            </Col>
            <Col span={8}>
              <Statistic title="info" value={themeAlerts24h.info} />
            </Col>
          </Row>
          <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
            Cycle stage changes · see /api/theme-alerts.
          </Text>
        </Card>

        {/* 9. Sentiment shifts */}
        <Card
          size="small"
          title={
            <Flex align="center" gap={8}>
              <span>9 · Sentiment Shifts (7d top 5)</span>
              <Tag color={sentimentShifts.rows.length > 0 ? 'processing' : 'success'} bordered={false}>
                {sentimentShifts.rows.length}
              </Tag>
            </Flex>
          }
        >
          {sentimentShifts.rows.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No directional shifts in last 7d"
              imageStyle={{ height: 40 }}
            />
          ) : (
            <SentimentShiftsTable rows={sentimentShifts.rows} />
          )}
        </Card>

        {/* 10. Cron triggers */}
        <CronTriggers crons={crons} manualTriggersEnabled={manualTriggersEnabled} />
      </Flex>
    </AdminShell>
  )
}

function CronStatusTable({ rows }: { rows: CronCheckRow[] }) {
  const { token } = theme.useToken()
  const columns: ColumnsType<CronCheckRow> = [
    {
      title: 'Path',
      dataIndex: 'path',
      render: (v: string) => (
        <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 11, color: token.colorTextSecondary }}>
          {v}
        </Text>
      ),
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      width: 130,
      render: (v: string) => (
        <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 11, color: token.colorTextTertiary }}>
          {v}
        </Text>
      ),
    },
    {
      title: 'Last run',
      dataIndex: 'last_run_iso',
      width: 110,
      render: (_, r) => (
        <Tooltip title={r.proxy_label}>
          <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>{relTime(r.last_run_iso)}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      align: 'right',
      render: (_, r) => {
        if (r.proxy_label === '(no proxy)')
          return <Tag bordered={false}>no proxy</Tag>
        if (r.stale)
          return (
            <Tag color="error" bordered={false} icon={<CloseCircleFilled />}>
              stale
            </Tag>
          )
        if (r.last_run_iso)
          return (
            <Tag color="success" bordered={false} icon={<CheckCircleFilled />}>
              ok
            </Tag>
          )
        return (
          <Tag color="warning" bordered={false} icon={<ExclamationCircleFilled />}>
            empty
          </Tag>
        )
      },
    },
  ]
  return (
    <Table
      size="small"
      pagination={false}
      columns={columns}
      dataSource={rows.map((r, i) => ({ ...r, key: r.path + '__' + i }))}
    />
  )
}

function SentimentShiftsTable({ rows }: { rows: SentimentShiftRow[] }) {
  const { token } = theme.useToken()
  const columns: ColumnsType<SentimentShiftRow> = [
    {
      title: 'Theme',
      dataIndex: 'theme_name',
      render: (_, r) => (
        <Link href={`/themes/${r.theme_id}`} style={{ color: token.colorText }}>
          {r.theme_name}
        </Link>
      ),
    },
    {
      title: 'Score',
      dataIndex: 'sentiment_score',
      width: 80,
      align: 'right',
      render: (v: number | null) => (
        <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 12 }}>
          {v !== null ? v.toFixed(2) : '-'}
        </Text>
      ),
    },
    {
      title: 'Dominant',
      dataIndex: 'dominant_sentiment',
      width: 100,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">-</Text>
        const color = v === 'bullish' ? 'success' : v === 'bearish' ? 'error' : 'default'
        return (
          <Tag color={color} bordered={false}>
            {v}
          </Tag>
        )
      },
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      width: 110,
      render: (v: string | null) => (
        <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 11, color: token.colorTextTertiary }}>
          {v ?? '-'}
        </Text>
      ),
    },
    {
      title: 'Days',
      dataIndex: 'last_shift_days_ago',
      width: 60,
      align: 'right',
      render: (v: number | null) => <Text style={{ fontSize: 12 }}>{v ?? '-'}</Text>,
    },
  ]
  return (
    <Table
      size="small"
      pagination={false}
      columns={columns}
      dataSource={rows.map((r) => ({ ...r, key: r.theme_id }))}
    />
  )
}
