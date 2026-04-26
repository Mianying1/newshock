import * as Sentry from '@sentry/nextjs'
import { anthropic, MODEL_SONNET } from './anthropic'
import { supabaseAdmin } from './supabase-admin'

export type Direction = 'supports' | 'contradicts' | 'neutral'

export interface ClassifyResult {
  direction: Direction
  reasoning: string
  reasoning_zh: string
  cost_usd: number
}

export interface ThemeCounterSummary {
  supports_count: number
  contradicts_count: number
  neutral_count: number
  last_updated: string
}

// Sonnet 4.5 pricing: $3 / MTok input, $15 / MTok output.
function sonnetCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15
}

const SYSTEM_PROMPT =
  'You are a macro theme analyst. Judge whether a single event is directional evidence for a theme. ' +
  'Return ONLY JSON, no markdown, no extra text.'

function buildUserPrompt(theme: { name: string; summary: string | null }, event: { headline: string; raw: string | null }) {
  const raw = (event.raw ?? '').slice(0, 500)
  return `你是宏观主题分析师 · 判断单个 event 对 theme 的方向证据.

Theme: ${theme.name}
Theme summary: ${theme.summary ?? '(none)'}

Event headline: ${event.headline}
Event summary: ${raw || '(none)'}

==============================================================
判断框架 · 严格按此执行
==============================================================

Step 1 · 理解 theme 的核心主张
主线在押注什么发生? (例: "Iran Crisis Escalation · Oil War Premium"
押注 = 伊朗紧张 → 油价溢价延续 → 供应链风险持续)

Step 2 · event 是主线可观测化的哪一面?
- supports: event 本身是"主线正在发生"的证据
  例: 油价上涨 / 供应中断 / 外交破裂 / 军事对抗 / 政策加码
- contradicts: event 本身是"主线反向"的证据
  例: 油价下跌 / 供应恢复 / 外交接触 / 停火谈判 / 政策缓和
- neutral: event 相关但不含方向信号
  例: 程序性文件 / 未披露具体内容 / 远端/无关方

Step 3 · 避免二阶推理陷阱
❌ 错: "德国加强军备 → 紧张加剧 → 削弱 NATO readiness 主线"
✅ 对: "德国加强军备 = NATO readiness 可观测化 → supports"

❌ 错: "日本半导体出口增长 → 竞争力改善 → neutral"
✅ 对: "日本出口增长 = 削弱'中国产能过剩推动出口'主线 → contradicts"

规则: 只看 event 是否是"主线发生的直接证据"或"主线反向的直接证据".
不要推演二阶后果. 不要用"但是/然而"引入反向逻辑.

Step 3.5 · 替代/竞争陷阱 · 关键
判错率最高的模式:把"替代方案/竞争对手发生"误判为 contradicts 或 neutral.

❌ 错: "德国买新系统 → 旧装备过时 → 削弱 readiness"
✅ 对: "theme 押注 = 防务需求上升 · 德国军事强化 = 防务需求可观测化 → supports"

❌ 错: "丹麦选 SAMP/T 不选爱国者 → 爱国者承包商不利"
✅ 对: "theme 押注 = 防空弹药需求延续 · 欧洲买防空系统 = 需求证据 → supports"

❌ 错: "NVDA 投 Marvell 而非 Tower → 与主线公司不符 → neutral"
✅ 对: "theme 押注 = NVDA 锁定专业代工产能 · 投资同类公司 = 主线证据 → supports"

核心规则:
- 看 theme 的"机制"(什么现象在发生/加速/放缓) · 不是看 theme 标签里的公司名
- event 主体不是 theme 点名的那家公司 ≠ neutral
- 如果 event 是 theme 描述的"某类行为"发生(即使主体换了) · 判 supports
- 只有当 event 明确是"主线反方向"发生时 · 判 contradicts

Step 4 · neutral 的严格门槛
只有以下情况才判 neutral:
(a) 纯程序性披露 (8-K 无具体内容 / Filer 登记)
(b) 相关方但未涉及主线核心机制
(c) 事件内容完全不含方向信号

如果 event 明显指向主线 "会发生" 或 "不会发生" 的任一方向 ·
必须判 supports 或 contradicts · 不要偷懒判 neutral.

==============================================================
输出 JSON · 不要 markdown · 不要多余文字
==============================================================

{
  "direction": "supports" | "contradicts" | "neutral",
  "reasoning_zh": "按模板: [event 关键事实] = [主线某机制] 的 [正向/反向/无方向] 证据. 一句话,20-40 字.",
  "reasoning": "英文翻译上面那句"
}

语言克制 · 用 "推进 / 反向 / 无方向" · 不用 "强烈 / 显著" 等主观词.`
}

export async function classifyEventDirection(eventId: string): Promise<ClassifyResult | null> {
  const { data: event, error: evErr } = await supabaseAdmin
    .from('events')
    .select('id, headline, raw_content, trigger_theme_id')
    .eq('id', eventId)
    .single()
  if (evErr || !event || !event.trigger_theme_id) return null

  const { data: theme, error: thErr } = await supabaseAdmin
    .from('themes')
    .select('id, name, summary')
    .eq('id', event.trigger_theme_id)
    .single()
  if (thErr || !theme) return null

  let msg
  try {
    msg = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(
            { name: theme.name, summary: theme.summary },
            { headline: event.headline, raw: event.raw_content ?? null }
          ),
        },
      ],
    })
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        tags: { function: 'classifyEventDirection', file: 'lib/counter-evidence.ts', model: MODEL_SONNET },
        extra: { event_id: event.id, theme_id: theme.id, theme_name: theme.name },
      })
    }
    throw error
  }

  const text = msg.content
    .flatMap((c) => (c.type === 'text' ? [c.text] : []))
    .join('')
    .trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('haiku parse failed: no JSON block')

  const parsed = JSON.parse(jsonMatch[0]) as {
    direction?: string
    reasoning?: string
    reasoning_zh?: string
  }
  const direction = parsed.direction
  if (direction !== 'supports' && direction !== 'contradicts' && direction !== 'neutral') {
    throw new Error(`invalid direction: ${direction}`)
  }
  const reasoning = (parsed.reasoning ?? '').slice(0, 500)
  const reasoning_zh = (parsed.reasoning_zh ?? '').slice(0, 500)

  const costUsd = sonnetCost(msg.usage?.input_tokens ?? 0, msg.usage?.output_tokens ?? 0)

  const { error: updErr } = await supabaseAdmin
    .from('events')
    .update({
      supports_or_contradicts: direction,
      counter_evidence_reasoning: reasoning,
      counter_evidence_reasoning_zh: reasoning_zh,
    })
    .eq('id', eventId)
  if (updErr) throw new Error(`db update failed: ${updErr.message}`)

  return { direction, reasoning, reasoning_zh, cost_usd: costUsd }
}

export async function refreshThemeCounterSummary(themeId: string): Promise<ThemeCounterSummary> {
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('supports_or_contradicts')
    .eq('trigger_theme_id', themeId)
    .not('supports_or_contradicts', 'is', null)

  const rows = (events ?? []) as { supports_or_contradicts: Direction }[]
  const summary: ThemeCounterSummary = {
    supports_count: rows.filter((e) => e.supports_or_contradicts === 'supports').length,
    contradicts_count: rows.filter((e) => e.supports_or_contradicts === 'contradicts').length,
    neutral_count: rows.filter((e) => e.supports_or_contradicts === 'neutral').length,
    last_updated: new Date().toISOString(),
  }

  await supabaseAdmin.from('themes').update({ counter_evidence_summary: summary }).eq('id', themeId)
  return summary
}

async function refreshAllThemeCounterSummary(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('events')
    .select('trigger_theme_id')
    .not('trigger_theme_id', 'is', null)
    .not('supports_or_contradicts', 'is', null)
  const ids = new Set<string>()
  for (const row of (data ?? []) as { trigger_theme_id: string }[]) {
    if (row.trigger_theme_id) ids.add(row.trigger_theme_id)
  }
  for (const id of Array.from(ids)) await refreshThemeCounterSummary(id)
  return ids.size
}

export interface ClassifyBatchResult {
  success: number
  failed: number
  total_cost_usd: number
  distribution: { supports: number; contradicts: number; neutral: number }
  themes_refreshed: number
  errors: Array<{ event_id: string; error: string }>
}

export async function classifyAllUnclassified(limit = 500): Promise<ClassifyBatchResult> {
  const { data } = await supabaseAdmin
    .from('events')
    .select('id')
    .not('trigger_theme_id', 'is', null)
    .is('supports_or_contradicts', null)
    .limit(limit)

  const events = (data ?? []) as { id: string }[]
  const distribution = { supports: 0, contradicts: 0, neutral: 0 }
  const errors: Array<{ event_id: string; error: string }> = []
  let success = 0
  let failed = 0
  let total_cost_usd = 0

  for (const e of events) {
    try {
      const r = await classifyEventDirection(e.id)
      if (r) {
        distribution[r.direction] += 1
        total_cost_usd += r.cost_usd
        success += 1
      }
    } catch (err: unknown) {
      failed += 1
      errors.push({ event_id: e.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const themes_refreshed = await refreshAllThemeCounterSummary()

  return { success, failed, total_cost_usd, distribution, themes_refreshed, errors: errors.slice(0, 20) }
}
