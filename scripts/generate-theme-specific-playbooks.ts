import { config } from 'dotenv'
config({ path: '.env.local' })

import * as fs from 'node:fs'
import * as path from 'node:path'

interface ArchetypePlaybook {
  typical_duration_label?: string
  typical_duration_days_approx?: [number, number]
  historical_cases?: Array<{
    name: string
    approximate_duration: string
    peak_move: string
    exit_trigger: string
    confidence: 'high' | 'medium'
  }>
  this_time_different?: {
    differences: Array<{
      dimension: string
      description: string
      direction: string
      confidence: string
    }>
    similarities: Array<{ dimension: string; description: string }> | string[]
    observation: string
  }
  exit_signals?: string[]
  duration_type?: 'bounded' | 'extended' | 'dependent'
  duration_type_reasoning?: string
  real_world_timeline?: {
    approximate_start: string
    description: string
    current_maturity_estimate: 'early' | 'mid' | 'late' | 'beyond_typical'
  }
}

interface ThemeRow {
  id: string
  name: string
  name_zh: string | null
  summary: string | null
  summary_zh: string | null
  archetype_id: string
  status: string
  theme_archetypes: {
    id: string
    name: string
    description: string | null
    category: string | null
    playbook: ArchetypePlaybook | null
  } | null
}

interface EventRow {
  short_headline: string | null
  short_headline_zh: string | null
  headline: string
  event_date: string | null
}

const PROMPT_TEMPLATE = `你是一名深谙金融市场史的结构性分析师。

任务：为下面这个**具体主题**生成专属历史 Playbook。当前 archetype 共享的 Playbook 在多个 sibling 主题间通用，缺乏针对性。需要给出更精准的历史可比期。

## Theme
- 主题名: {theme_name}
- 主题描述: {theme_summary}
- 所属 archetype: {archetype_name}
- archetype 描述: {archetype_description}

## Archetype 共享 Playbook（基线，仅作参考，不要照抄）
{archetype_playbook_json}

## 该主题近 90 天事件流（最多 20 条）
{recent_events}

## 输出要求
生成一个**比 archetype 基线更具体**的历史 Playbook。要求：

1. historical_cases（2-4 条）必须紧贴**本主题的具体内容**（行业、规模、技术代际、宏观环境），不是 archetype 通用案例。
   举例：
   - "AI 数据中心光互联" 应看：千兆以太网周期、思科光模块周期、数据中心 SSD 转型
   - "AI Capex" 应看：Cloud 1.0 (1999-2002)、4G LTE 资本开支周期、大型机→PC 周期
   - "Iran Crisis" 应看：1979 伊朗革命、1990 海湾、2003 伊战、2019 沙特袭击
2. 每个案例必须真实存在，避免编造。如不确定，宁少勿假。
3. 在 this_time_different.observation 中**明确说明本主题相比 archetype 通用模式的差异点**。

## 输出 JSON 严格匹配以下 schema（与 archetype playbook 同构，便于 UI 复用）

{
  "typical_duration_label": "few weeks" | "1-3 months" | "3-6 months" | "6-12 months" | "12+ months",
  "typical_duration_days_approx": [min_days, max_days],
  "historical_cases": [
    {
      "name": "具体事件名（中文优先，括号注英文+年份）",
      "approximate_duration": "约 X 个月/X 年",
      "peak_move": "定性描述涨跌幅",
      "exit_trigger": "什么终结了此周期",
      "confidence": "high" | "medium"
    }
  ],
  "this_time_different": {
    "differences": [
      {
        "dimension": "demand_side" | "supply_side" | "macro" | "policy" | "technology",
        "description": "...",
        "direction": "may_extend" | "may_shorten" | "uncertain",
        "confidence": "high" | "medium"
      }
    ],
    "similarities": [
      { "dimension": "...", "description": "..." }
    ],
    "observation": "本主题与 archetype 通用模式的关键差异（这是新增重点）"
  },
  "exit_signals": ["...", "..."],
  "duration_type": "bounded" | "extended" | "dependent",
  "duration_type_reasoning": "1 句话",
  "real_world_timeline": {
    "approximate_start": "...",
    "description": "...",
    "current_maturity_estimate": "early" | "mid" | "late" | "beyond_typical"
  },
  "specific_to_this_theme": "1-2 句话，说明本 playbook 与 archetype 基线的关键差异"
}

仅返回 JSON，不要 markdown fence。`

interface UsageStats {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

interface GenerationResult {
  playbook: (ArchetypePlaybook & { specific_to_this_theme?: string }) | null
  usage: UsageStats | null
  error?: string
}

async function generateForTheme(
  theme: ThemeRow,
  events: EventRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anthropic: any,
  model: string
): Promise<GenerationResult> {
  const archetype = theme.theme_archetypes
  if (!archetype) {
    return { playbook: null, usage: null, error: 'no archetype' }
  }

  const eventLines = events.length === 0
    ? '(近 90 天无事件 — 仅基于主题描述生成)'
    : events
        .slice(0, 20)
        .map((e, i) => {
          const headline = e.short_headline_zh ?? e.short_headline ?? e.headline
          return `${i + 1}. [${e.event_date ?? '?'}] ${headline}`
        })
        .join('\n')

  const prompt = PROMPT_TEMPLATE
    .replace('{theme_name}', theme.name_zh ?? theme.name)
    .replace('{theme_summary}', theme.summary_zh ?? theme.summary ?? '(no summary)')
    .replace('{archetype_name}', archetype.name)
    .replace('{archetype_description}', archetype.description ?? '(no description)')
    .replace('{archetype_playbook_json}', JSON.stringify(archetype.playbook ?? {}, null, 2))
    .replace('{recent_events}', eventLines)

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let cleaned = text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { playbook: null, usage: response.usage, error: 'no json in response' }
    }
    const sanitized = jsonMatch[0].replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    const playbook = JSON.parse(sanitized)
    return { playbook, usage: response.usage }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { playbook: null, usage: null, error: msg }
  }
}

async function fetchRecentEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  themeId: string
): Promise<EventRow[]> {
  const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('headline, short_headline, short_headline_zh, event_date')
    .eq('trigger_theme_id', themeId)
    .gte('event_date', cutoff)
    .order('event_date', { ascending: false })
    .limit(20)
  if (error) {
    console.error(`  events fetch error: ${error.message}`)
    return []
  }
  return (data ?? []) as EventRow[]
}

const PRICE_PER_M_INPUT = 3
const PRICE_PER_M_OUTPUT = 15

function estimateCost(usage: UsageStats): number {
  return (usage.input_tokens / 1_000_000) * PRICE_PER_M_INPUT
       + (usage.output_tokens / 1_000_000) * PRICE_PER_M_OUTPUT
}

async function main() {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')
  const { anthropic, MODEL_SONNET } = await import('@/lib/anthropic')

  const force = process.argv.includes('--force')
  const dryRun = process.argv.includes('--dry-run')
  const themeArg = process.argv.find(a => a.startsWith('--theme='))?.split('=')[1]
  const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
  const limit = limitArg ? parseInt(limitArg, 10) : undefined

  let query = supabaseAdmin
    .from('themes')
    .select(
      'id, name, name_zh, summary, summary_zh, archetype_id, status, ' +
      'specific_playbook, ' +
      'theme_archetypes!inner(id, name, description, category, playbook)'
    )
    .eq('status', 'active')
    .order('theme_strength_score', { ascending: false })

  if (themeArg) query = query.eq('id', themeArg)
  if (limit) query = query.limit(limit)

  const { data: rows, error } = await query
  if (error) {
    console.error(`themes fetch failed: ${error.message}`)
    process.exit(1)
  }

  type Row = ThemeRow & { specific_playbook: ArchetypePlaybook | null }
  let themes = (rows ?? []) as unknown as Row[]
  if (!force) {
    themes = themes.filter(t => !t.specific_playbook)
  }

  console.log(`Active themes to process: ${themes.length} (force=${force}, dryRun=${dryRun})`)
  if (themes.length === 0) {
    console.log('Nothing to do.')
    return
  }

  const outDir = path.join(process.cwd(), 'tmp')
  fs.mkdirSync(outDir, { recursive: true })
  const auditPath = path.join(outDir, 'theme-specific-playbook-run.jsonl')
  const auditStream = fs.createWriteStream(auditPath, { flags: 'a' })

  let succeeded = 0
  let failed = 0
  let totalCost = 0
  const failures: { id: string; name: string; error: string }[] = []

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i]
    const label = `[${i + 1}/${themes.length}] ${theme.name}`
    console.log(`\n${label} (archetype=${theme.theme_archetypes?.name ?? '?'})`)

    const events = await fetchRecentEvents(supabaseAdmin, theme.id)
    console.log(`  events: ${events.length}`)

    if (dryRun) {
      console.log('  (dry-run · skipping LLM)')
      continue
    }

    const result = await generateForTheme(theme, events, anthropic, MODEL_SONNET)
    if (!result.playbook) {
      console.log(`  ❌ ${result.error}`)
      failed++
      failures.push({ id: theme.id, name: theme.name, error: result.error ?? 'unknown' })
      auditStream.write(JSON.stringify({ id: theme.id, name: theme.name, error: result.error }) + '\n')
      continue
    }

    if (result.usage) {
      const cost = estimateCost(result.usage)
      totalCost += cost
      console.log(`  ✅ in=${result.usage.input_tokens} out=${result.usage.output_tokens} cost=$${cost.toFixed(4)}`)
    }

    const cases = result.playbook.historical_cases ?? []
    console.log(`     ${cases.length} cases · "${result.playbook.typical_duration_label ?? '?'}"`)
    cases.slice(0, 3).forEach(c => console.log(`       - ${c.name}`))

    const { error: updErr } = await supabaseAdmin
      .from('themes')
      .update({
        specific_playbook: result.playbook,
        specific_playbook_generated_at: new Date().toISOString(),
      })
      .eq('id', theme.id)

    if (updErr) {
      console.log(`  ❌ DB update failed: ${updErr.message}`)
      failed++
      failures.push({ id: theme.id, name: theme.name, error: `db: ${updErr.message}` })
      auditStream.write(JSON.stringify({ id: theme.id, name: theme.name, db_error: updErr.message }) + '\n')
      continue
    }

    succeeded++
    auditStream.write(JSON.stringify({
      id: theme.id,
      name: theme.name,
      archetype_id: theme.archetype_id,
      cases: cases.map(c => c.name),
      observation: result.playbook.this_time_different?.observation,
      specific_to_this_theme: (result.playbook as { specific_to_this_theme?: string }).specific_to_this_theme,
      cost: result.usage ? estimateCost(result.usage) : null,
    }) + '\n')

    await new Promise(r => setTimeout(r, 400))
  }

  auditStream.end()

  console.log(`\n=== Summary ===`)
  console.log(`Succeeded: ${succeeded}`)
  console.log(`Failed:    ${failed}`)
  console.log(`Total cost: $${totalCost.toFixed(2)}`)
  console.log(`Audit log: ${auditPath}`)
  if (failures.length > 0) {
    console.log(`\nFailures:`)
    failures.forEach(f => console.log(`  ${f.id} (${f.name}): ${f.error}`))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
