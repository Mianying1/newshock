/* Dry-run · Ticker Detail narrative LLM prompt test
   No DB writes · No file edits · Output: /tmp/ticker-narrative-test.json
   Tickers: ASML · NVDA · LLY  ·  Model: Sonnet 4.5 · temperature: 0
*/
import { config } from 'dotenv'
config({ path: '.env.local' })

import { writeFileSync } from 'node:fs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { anthropic, MODEL_SONNET } from '@/lib/anthropic'

const TICKERS = ['ASML', 'NVDA', 'LLY']
const EVENT_LOOKBACK_DAYS = 30
const TOP_EVENTS_PER_TICKER = 10
// Sonnet 4-5 pricing (per 1M tokens)
const PRICE_INPUT = 3
const PRICE_OUTPUT = 15

type ThemeRow = {
  id: string
  name: string
  status: string
  archetype_id: string | null
  category: string | null
  tier: number
  exposure_pct: number | null
  exposure_direction: string | null
  role_reasoning: string | null
}

type EventRow = {
  id: string
  event_date: string
  headline: string
  level_of_impact: string | null
  source_name: string | null
  trigger_theme_id: string | null
  trigger_theme_name: string | null
}

type TickerData = {
  symbol: string
  company_name: string | null
  sector: string | null
  themes: ThemeRow[]
  events: EventRow[]
}

async function fetchTickerData(symbol: string): Promise<TickerData | null> {
  const upper = symbol.toUpperCase()

  const { data: ticker } = await supabaseAdmin
    .from('tickers')
    .select('symbol, company_name, sector')
    .eq('symbol', upper)
    .single()
  if (!ticker) return null

  const { data: recs } = await supabaseAdmin
    .from('theme_recommendations')
    .select('theme_id, tier, exposure_pct, exposure_direction, role_reasoning')
    .eq('ticker_symbol', upper)
  const recRows = recs ?? []
  const themeIds = Array.from(new Set(recRows.map((r) => r.theme_id)))

  const { data: themes } = themeIds.length
    ? await supabaseAdmin
        .from('themes')
        .select('id, name, status, archetype_id, theme_archetypes(category)')
        .in('id', themeIds)
        .in('status', ['active', 'cooling'])
    : { data: [] }
  const themeRows = themes ?? []

  const recByTheme = new Map(recRows.map((r) => [r.theme_id, r]))
  const enrichedThemes: ThemeRow[] = themeRows.map((t: any) => {
    const r = recByTheme.get(t.id)
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      archetype_id: t.archetype_id,
      category: t.theme_archetypes?.category ?? null,
      tier: r?.tier ?? 3,
      exposure_pct: r?.exposure_pct ?? null,
      exposure_direction: r?.exposure_direction ?? null,
      role_reasoning: r?.role_reasoning ?? null,
    }
  })

  const activeThemeIds = enrichedThemes.map((t) => t.id)
  const since = new Date(Date.now() - EVENT_LOOKBACK_DAYS * 86400000).toISOString()
  const { data: events } = activeThemeIds.length
    ? await supabaseAdmin
        .from('events')
        .select('id, event_date, headline, level_of_impact, source_name, trigger_theme_id')
        .in('trigger_theme_id', activeThemeIds)
        .gte('event_date', since)
        .order('event_date', { ascending: false })
        .limit(50)
    : { data: [] }

  const themeNameById = new Map(enrichedThemes.map((t) => [t.id, t.name]))
  const impactRank: Record<string, number> = { high: 3, medium: 2, low: 1 }
  const sortedEvents = (events ?? [])
    .map((e: any): EventRow => ({
      id: e.id,
      event_date: e.event_date,
      headline: e.headline,
      level_of_impact: e.level_of_impact,
      source_name: e.source_name,
      trigger_theme_id: e.trigger_theme_id,
      trigger_theme_name: themeNameById.get(e.trigger_theme_id) ?? null,
    }))
    .sort((a, b) => {
      const ar = impactRank[a.level_of_impact ?? 'low'] ?? 1
      const br = impactRank[b.level_of_impact ?? 'low'] ?? 1
      if (br !== ar) return br - ar
      return new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
    })
    .slice(0, TOP_EVENTS_PER_TICKER)

  return {
    symbol: ticker.symbol,
    company_name: ticker.company_name,
    sector: ticker.sector,
    themes: enrichedThemes,
    events: sortedEvents,
  }
}

const SYSTEM_PROMPT = `你是一个资深财经分析师 · 给散户和 prosumer 投资者写公司投资简报。

# 任务

为 {ticker} ({company_name}) 生成投资叙事 · 输出 JSON 格式 · 4 个字段。

# 输入数据

[Active Themes · {N} 个]
{themes_json}

[Recent Events · 最近 30 天]
{events_json}

# 输出要求(JSON · 严格按格式)

{
  "hero_line": "...",
  "top_themes": [
    { "theme_id": "...", "label": "..." },
    { "theme_id": "...", "label": "..." }
  ],
  "reasoning_paragraphs": {
    "core_tension": "...",
    "why_benefits": "...",
    "risk_sources": "..."
  }
}

# 各字段要求

## hero_line · 一句话定位

约 30 字 · 硬上限 55 字(适配中英混排)· 不要为凑字数牺牲信息密度 · 中文 · 像 FT / The Economist 标题。

要求:
- 抓住 ticker 当前最核心的投资矛盾
- 不堆砌"全球领导者""核心受益者"等套话
- 用具体行业语言
- 字数是参考 · 不是 KPI · 信息密度高就让它略长 · 不要硬切

好例子:
- ASML: "AI 周期的 picks-and-shovels · 同时是中美 tech war 的 chokepoint"
- NVDA: "AI Capex 超级周期的核心定价权 · 估值已 priced in 完美执行"
- LLY: "GLP-1 主线的双寡头之一 · 但被 mega cap conglomerate dilution 持续稀释"

## top_themes · 最重要的 2 个主题

从 active_themes 里挑 · 优先标准:
1. tier 1 · exposure_pct ≥ 70 优先
2. 一个 benefits + 一个 headwind 组合优于两个同向(展示矛盾) — 这是偏好 · 不是硬约束
3. 如果都是 benefits · 选 exposure_pct 最高的 2 个

格式:
- theme_id: 直接用 archetype_id
- label: 主题简称(8-12 字)+ 方向标签

例:
{ "theme_id": "ai_capex_infrastructure", "label": "AI Capex 超级周期 · 受益" }
{ "theme_id": "us_china_semiconductor_controls", "label": "美国对华芯片管制 · 承压" }

### 硬性规则 · Direction 标签必须忠实于输入

label 末尾的方向标签必须严格反映输入 JSON 里 exposure_direction 字段的方向 · 不允许 LLM 创造性反转。

- exposure_direction = "benefits" → 标签词汇限定: 受益 · 顺风 · 利好 · 定价权扩张 · 订单可见度 · 等正向描述
- exposure_direction = "headwind" → 标签词汇限定: 承压 · 逆风 · 压制 · 估值天花板 · 等负向描述

绝对禁止:
- 把 exposure_direction = benefits 的主题包装成 "短期承压" "估值天花板" "已 priced in 的逆风" 等 headwind 措辞
- 把 exposure_direction = headwind 的主题包装成 "受益" "顺风" 等 benefits 措辞
- 即便 LLM 觉得这样叙事更有张力 · 也不允许反转

唯一例外: 输入 exposure_direction 为 null 或缺失时 · 才允许 LLM 自行判断方向。

### benefits + headwind 组合是偏好 · 不是硬约束

当候选池只有 benefits 主题(或只有 headwind) · 不要为了凑反向组合而强行把其中一个标成对立方向。改用以下三种手段在 core_tension 制造张力:

1. **时间维度**: 短期(财报 / 政策窗口 / 几周)vs 中期(产能 / 需求曲线 / 数季)— 不同 benefits 在不同时间窗口贡献不一样 · 强弱节奏本身就是矛盾
2. **传导层级**: 直接受益(终端定价 / 量价齐升)vs 间接受益(供应链 ASP / 二阶传导)— 弹性 · 确定性 · 时滞都不同
3. **确定性维度**: 已 priced in 的 benefits(共识 · 估值充分)vs 未充分定价的 benefits(预期差 · alpha 来源)— 后者才是真正的投资机会

例: ASML 的两个主题都是 benefits
{ "theme_id": "ai_capex_infrastructure", "label": "AI Capex 超级周期 · 受益" }
{ "theme_id": "us_china_tariff_escalation", "label": "中美关税博弈 · 受益(供应链转移)" }
core_tension 用时间 / 传导差: "AI Capex 是 multi-year 直接受益 · 关税博弈则是更慢的供应链结构性转移红利 · 节奏错配制造定价机会。"

例: LLY 的多个主题都是 benefits
{ "theme_id": "pharma_innovation_super_cycle", "label": "Pharma 创新超级周期 · 受益" }
{ "theme_id": "demographic_aging_health", "label": "老龄化医疗需求 · 受益" }
core_tension 用确定性维度: "GLP-1 主线已被市场充分定价 · 真正的预期差在 LLY 早期 pipeline 多 indication 拓展。老龄化是慢变量 · 短期不构成 driver。"

绝对不要写: "Pharma 创新超级周期 · 短期承压" — 这是把 benefits 反转成 headwind · 违反硬性规则。

## reasoning_paragraphs · 3 段叙事(每段 3-5 句 · prose · 不要 list)

### core_tension · 当前的核心矛盾(60-100 字)

回答: 为什么这只 ticker 现在值得看?核心是什么 driving 它?
要求:
- 第一句直接抛出矛盾或机会
- 提到 1-2 个具体催化剂(not 抽象趋势)
- 不要重复 hero_line

例(ASML):
"ASML 处于一个罕见的双重信号位置 · AI Capex 超级周期带来 multi-year EUV 设备订单 backlog · 但中美技术博弈把它选为关键 chokepoint。这不是简单的 binary trade · 而是 structural growth 叠加 binary risk 的组合。短期催化看 NVDA / TSMC 财报指引 · 中期看荷兰出口管制松紧。"

### why_benefits · 为什么受益(60-100 字)

回答: top theme(benefits 那个)的核心传导链是什么?
要求:
- 引用具体 archetype 逻辑
- 提到 1-2 个传导节点(下游公司 / 产能数据 / 订单 backlog)
- 数字尽量具体(N 季度 backlog · 多少亿 TAM 等)

例(ASML AI Capex):
"AI infrastructure capex 给 ASML 带来 2-3 年 EUV 设备订单可见度。NVDA 和 AVGO 的产能锁定信号传导到台积电 · TSMC 的 EUV 采购节奏决定 ASML 的 ASP 和出货曲线。High-NA EUV 即将进入量产周期 · ASP 从 \$200M 跳到 \$380M · 是下一轮利润弹性的核心。"

### risk_sources · 风险来源(60-100 字)

回答: top headwind theme 或最大不确定性?
要求:
- 不只是说"出口管制" · 要说"管制下一步什么时候 / 影响多少 revenue"
- 提到 quantitative impact(过去 N% revenue · 现在多少)
- 提到时间线(when does this resolve)

例(ASML 出口管制):
"中国市场曾是 ASML 15-20% 的 revenue · 2023 年荷兰跟进美国管制后已显著下降。但下一轮 DUV 限制可能进一步收紧 · 对成熟制程业务造成增量压力。短期看美荷下半年磋商节奏 · 长期看欧盟会不会加入 Tech Alliance 联合管制。"

# 风格要求

- 中文 · 但允许嵌入英文 financial 术语(EUV · backlog · ASP · TAM 等)
- Bloomberg / FT 风格 · 不是雪球散户口吻
- 不用感叹号 · 不用"目前来看""值得关注""未来可期"等模糊表达
- 每段开头不要重复 ticker 名字
- 直接给判断 · 不要"可能"  "或许" 等过度对冲

# 不要做的事

- 不要给买卖建议
- 不要预测股价
- 不要说"投资有风险"等免责声明
- 不要复述 active_themes 里所有内容 · 只挑核心
- 不要写"综上所述"等总结句`

function buildUserPrompt(t: TickerData): string {
  const themesJson = JSON.stringify(
    t.themes.map((th) => ({
      theme_id: th.archetype_id ?? th.id,
      name: th.name,
      category: th.category,
      tier: th.tier,
      exposure_pct: th.exposure_pct,
      exposure_direction: th.exposure_direction,
      reasoning: th.role_reasoning,
    })),
    null,
    2,
  )
  const eventsJson = JSON.stringify(
    t.events.map((e) => ({
      date: e.event_date,
      headline: e.headline,
      impact: e.level_of_impact,
      theme: e.trigger_theme_name,
      source: e.source_name,
    })),
    null,
    2,
  )
  return SYSTEM_PROMPT.replace('{ticker}', t.symbol)
    .replace('{company_name}', t.company_name ?? t.symbol)
    .replace('{N}', String(t.themes.length))
    .replace('{themes_json}', themesJson)
    .replace('{events_json}', eventsJson)
}

type LLMOut = {
  symbol: string
  raw: string
  parsed: any | null
  parse_error: string | null
  in_tokens: number
  out_tokens: number
  cost_usd: number
  elapsed_ms: number
}

async function callLLM(t: TickerData): Promise<LLMOut> {
  const userPrompt = buildUserPrompt(t)
  const t0 = Date.now()
  const resp = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 2000,
    temperature: 0,
    system: '你是一个严格按 JSON 格式返回的资深财经分析师。只返回 JSON · 不要任何前后缀文本。',
    messages: [{ role: 'user', content: userPrompt }],
  })
  const elapsed_ms = Date.now() - t0
  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
  let parsed: any | null = null
  let parse_error: string | null = null
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (e: any) {
    parse_error = e.message
  }
  const in_tokens = resp.usage.input_tokens
  const out_tokens = resp.usage.output_tokens
  const cost_usd = (in_tokens / 1_000_000) * PRICE_INPUT + (out_tokens / 1_000_000) * PRICE_OUTPUT
  return { symbol: t.symbol, raw: text, parsed, parse_error, in_tokens, out_tokens, cost_usd, elapsed_ms }
}

function validateOutput(out: LLMOut): string[] {
  const issues: string[] = []
  if (out.parse_error) issues.push(`JSON parse failed: ${out.parse_error}`)
  if (!out.parsed) return issues
  const p = out.parsed
  if (typeof p.hero_line !== 'string' || !p.hero_line) issues.push('hero_line missing/empty')
  if (!Array.isArray(p.top_themes) || p.top_themes.length !== 2) issues.push(`top_themes not array of 2 (got ${Array.isArray(p.top_themes) ? p.top_themes.length : typeof p.top_themes})`)
  else {
    p.top_themes.forEach((th: any, i: number) => {
      if (!th.theme_id) issues.push(`top_themes[${i}].theme_id missing`)
      if (!th.label) issues.push(`top_themes[${i}].label missing`)
    })
  }
  const r = p.reasoning_paragraphs
  if (!r || typeof r !== 'object') issues.push('reasoning_paragraphs missing/not object')
  else {
    for (const k of ['core_tension', 'why_benefits', 'risk_sources']) {
      if (typeof r[k] !== 'string' || !r[k]) issues.push(`reasoning_paragraphs.${k} missing/empty`)
    }
  }
  if (typeof p.hero_line === 'string') {
    const len = [...p.hero_line].length
    if (len < 15 || len > 55) issues.push(`hero_line length ${len} outside 15-55 hard limit`)
  }
  return issues
}

async function main() {
  console.log(`[setup] tickers=${TICKERS.join(',')}  model=${MODEL_SONNET}  temp=0`)
  const tickerData: TickerData[] = []
  for (const sym of TICKERS) {
    const td = await fetchTickerData(sym)
    if (!td) {
      console.log(`  ✗ ${sym} not found in DB`)
      continue
    }
    console.log(`  ${sym}  themes=${td.themes.length}  events_recent=${td.events.length}  sector=${td.sector ?? '-'}`)
    tickerData.push(td)
  }

  console.log(`\n[llm] running ${tickerData.length} sequential calls…`)
  const outs: LLMOut[] = []
  for (const td of tickerData) {
    const out = await callLLM(td)
    const issues = validateOutput(out)
    console.log(
      `  ${out.symbol}  ${out.elapsed_ms}ms  in=${out.in_tokens} out=${out.out_tokens} cost=$${out.cost_usd.toFixed(4)}  issues=${issues.length ? issues.join('; ') : 'none'}`,
    )
    outs.push(out)
  }
  const totalCost = outs.reduce((s, o) => s + o.cost_usd, 0)
  console.log(`\n[total] cost=$${totalCost.toFixed(4)}`)

  const result = {
    model: MODEL_SONNET,
    temperature: 0,
    total_cost_usd: totalCost,
    tickers: tickerData.map((td, i) => ({
      symbol: td.symbol,
      company_name: td.company_name,
      input_themes: td.themes.length,
      input_events: td.events.length,
      llm: outs[i] ? {
        in_tokens: outs[i].in_tokens,
        out_tokens: outs[i].out_tokens,
        cost_usd: outs[i].cost_usd,
        elapsed_ms: outs[i].elapsed_ms,
        parse_error: outs[i].parse_error,
        validation_issues: validateOutput(outs[i]),
        parsed: outs[i].parsed,
        raw: outs[i].raw,
      } : null,
      input_data: { themes: td.themes, events: td.events },
    })),
  }
  writeFileSync('/tmp/ticker-narrative-test.json', JSON.stringify(result, null, 2))
  console.log('\nwritten: /tmp/ticker-narrative-test.json')
}

main().catch((e) => { console.error(e); process.exit(1) })
