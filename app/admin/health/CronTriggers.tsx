'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button, Card, Table, Tooltip, Typography, message, theme } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlayCircleOutlined } from '@ant-design/icons'
import { runIngestAndThemeGen } from './cron-actions'

const { Text } = Typography

interface CronEntry {
  path: string
  schedule: string
}

interface Row {
  key: string
  path: string
  schedule: string
  label: string
  next: Date | null
  enabled: boolean
}

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>()
  if (field === '*') {
    for (let i = min; i <= max; i++) out.add(i)
    return out
  }
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      for (let i = a; i <= b; i++) out.add(i)
    } else {
      out.add(Number(part))
    }
  }
  return out
}

function nextCronFireUtc(schedule: string, from: Date = new Date()): Date | null {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [m, h, dom, mon, dow] = parts
  let mins: Set<number>, hours: Set<number>, doms: Set<number>, mons: Set<number>, dows: Set<number>
  try {
    mins = parseField(m, 0, 59)
    hours = parseField(h, 0, 23)
    doms = parseField(dom, 1, 31)
    mons = parseField(mon, 1, 12)
    dows = parseField(dow, 0, 6)
  } catch {
    return null
  }
  const t = new Date(from.getTime() + 60_000)
  t.setUTCSeconds(0, 0)
  for (let i = 0; i < 60 * 24 * 14; i++) {
    if (
      mins.has(t.getUTCMinutes()) &&
      hours.has(t.getUTCHours()) &&
      doms.has(t.getUTCDate()) &&
      mons.has(t.getUTCMonth() + 1) &&
      dows.has(t.getUTCDay())
    ) {
      return new Date(t)
    }
    t.setUTCMinutes(t.getUTCMinutes() + 1)
  }
  return null
}

function formatDelta(target: Date, from: Date): string {
  const ms = target.getTime() - from.getTime()
  if (ms < 0) return 'past'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `in ${hrs}h`
  return `in ${Math.round(hrs / 24)}d`
}

function cronLabel(path: string): string {
  const m = path.match(/\/api\/cron\/([^?]+)(?:\?(.+))?/)
  if (!m) return path
  const name = m[1]
  const slot = (m[2] ?? '').match(/slot=([^&]+)/)?.[1]
  return slot ? `${name} · ${slot}` : name
}

export default function CronTriggers({
  crons,
  manualTriggersEnabled,
}: {
  crons: CronEntry[]
  manualTriggersEnabled: boolean
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [api, contextHolder] = message.useMessage()
  const { token } = theme.useToken()

  const now = useMemo(() => new Date(), [])
  const rows: Row[] = useMemo(
    () =>
      crons.map((c, i) => ({
        key: `${c.path}__${i}`,
        path: c.path,
        schedule: c.schedule,
        label: cronLabel(c.path),
        next: nextCronFireUtc(c.schedule, now),
        enabled: c.path.startsWith('/api/cron/ingest'),
      })),
    [crons, now]
  )

  function onRun(key: string) {
    setBusyKey(key)
    startTransition(async () => {
      const res = await runIngestAndThemeGen()
      if (res.ok) {
        api.success({ content: res.message ?? 'triggered', duration: 6 })
      } else {
        api.error({ content: res.error ?? 'failed', duration: 8 })
      }
      setBusyKey(null)
    })
  }

  const columns: ColumnsType<Row> = [
    {
      title: 'Cron',
      dataIndex: 'label',
      key: 'label',
      render: (_, r) => (
        <div>
          <Text style={{ color: token.colorText }}>{r.label}</Text>
          <Text
            style={{
              display: 'block',
              fontFamily: token.fontFamilyCode,
              fontSize: 11,
              color: token.colorTextQuaternary,
            }}
          >
            {r.path}
          </Text>
        </div>
      ),
    },
    {
      title: 'Schedule (UTC)',
      dataIndex: 'schedule',
      key: 'schedule',
      width: 160,
      render: (v: string) => (
        <Text style={{ fontFamily: token.fontFamilyCode, fontSize: 12, color: token.colorTextSecondary }}>
          {v}
        </Text>
      ),
    },
    {
      title: 'Next',
      dataIndex: 'next',
      key: 'next',
      width: 200,
      render: (_, r) =>
        r.next ? (
          <Tooltip title={r.next.toISOString()}>
            <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
              {formatDelta(r.next, now)}{' '}
              <Text style={{ fontSize: 11, color: token.colorTextQuaternary }}>
                ({r.next.toISOString().slice(5, 16).replace('T', ' ')})
              </Text>
            </Text>
          </Tooltip>
        ) : (
          <Text style={{ color: token.colorTextQuaternary }}>—</Text>
        ),
    },
    {
      title: '',
      key: 'action',
      width: 110,
      align: 'right',
      render: (_, r) => {
        const prodLocked = !manualTriggersEnabled
        const tip = prodLocked
          ? 'Production read-only · admin auth not yet wired'
          : r.enabled
            ? 'POST /api/admin/trigger-cron · 30m cooldown'
            : 'API 暂不支持此 cron · 等待扩展'
        return (
          <Tooltip title={tip}>
            <Button
              size="small"
              type={!prodLocked && r.enabled ? 'primary' : 'default'}
              disabled={prodLocked || !r.enabled || busyKey !== null}
              loading={busyKey === r.key}
              icon={<PlayCircleOutlined />}
              onClick={() => onRun(r.key)}
            >
              {prodLocked ? 'Read-only' : 'Run Now'}
            </Button>
          </Tooltip>
        )
      },
    },
  ]

  return (
    <Card
      size="small"
      title="Cron Triggers · 手动运行"
      extra={
        <Text style={{ fontSize: 11, color: manualTriggersEnabled ? token.colorTextTertiary : token.colorWarning }}>
          {manualTriggersEnabled
            ? 'Run Now 仅 ingest · 复用 trigger-cron(30m 冷却)'
            : 'Production read-only · enable in dev or wire admin auth'}
        </Text>
      }
    >
      {contextHolder}
      {/* TODO: 需要扩展 API 支持任意 cron · 当前只能跑固定 ingest + theme generation */}
      <Table<Row>
        columns={columns}
        dataSource={rows}
        pagination={false}
        size="small"
        bordered={false}
      />
    </Card>
  )
}
