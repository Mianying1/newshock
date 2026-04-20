# Newshock · Decisions Log

## 2026-04-20

### PRD v0.1 锁定
- 产品名: Newshock
- 目标用户: 3 个月-1 年主题投资者, $50K-500K 账户, <30min/天
- 核心痛点: 看到新闻不知道真正该买谁、是不是晚了、历史上是否 work
- 核心功能 (F1): News → Upstream Ticker Mapping
- 垂直锁定: AI / semi / 云基础设施 / 美股

### Event Pattern 库 v0.1 (7 个 seed pattern)
- #01 Hyperscaler Mega Capex Deal
- #02 NVDA/AVGO 战略投资或 JV
- #03 中美半导体出口管制升级
- #04 小盘股 Earnings Beat + 指引上修
- #05 大厂并购同赛道公司
- #06 战争 / 地缘冲突升级
- #07 自然灾害 / 重大事故

### Pattern #01 验证结论
- Backtest pipeline 跑通 (backtest.py + FMP free tier)
- FMP free tier 数据残缺 (mid-cap 402, tier 2 零数据)
- 定性证据充分: Oracle 2025-09-10 +40% 单日, LITE 6 个月 400%+
- 决策: Pattern #01 PASS (qualitative)
- 延迟项: 上线前 1-2 周订 FMP Starter $30/mo 做精确回测

### 技术架构
- 前端: Next.js 14 + TypeScript + Tailwind + shadcn
- 后端: Supabase (Postgres + Auth)
- 部署: Vercel
- Cron: Vercel Cron 或 GitHub Actions
- 事件分类: Claude API (Sonnet)
- 支付: Stripe
- 邮件: Resend

### MVP 原则 (伦理红线)
- 不做实时推送 (每日 digest only)
- 不做社交 / leaderboard / 晒单
- 不对接券商 / 一键下单
- 每条推荐显著位置显示失败案例

---

## 2026-04-20 · 推荐架构决策 · Hybrid Model

### 问题
是否限定在封闭 ticker 库做推荐。

### 决策
采用 Hybrid 推荐架构:

1. VERIFIED 路径 (核心竞争力)
   - 基于 knowledge/patterns + knowledge/mappings
   - 每条推荐带 Score + 历史回测胜率
   - 手工 curate, 有责任有依据
   - v1 覆盖 7 个 pattern, 30-40 只 ticker

2. EXPLORATORY 路径 (补充覆盖)
   - 新闻未匹配任何 pattern 时, LLM 实时分析
   - 不显示 Score, 只给候选标的
   - 明确标记 "Speculative, not backtested"
   - 用户可以 "提议加入 knowledge base", 形成反馈 loop

### 产品优势
- Moat: VERIFIED 区的 pattern/ticker 库不可抄
- Coverage: EXPLORATORY 区保证任何新闻都有内容
- Flywheel: 用户使用 → 新 pattern 被发现 → curate → 进入 VERIFIED

### schema 影响
无需改表结构。events.pattern_id 为 null 时走 EXPLORATORY 路径。

### 竞品防御
- vs ChatGPT/Perplexity: 通用 LLM 无法产出 VERIFIED 推荐 (缺历史回测数据 + 缺手工 curate 的 mapping)
- vs Benzinga/SA: 传统工具无 event-driven 结构化推荐

### 新方向识别机制 (Pattern Discovery Loop)

产品运行中系统自动识别"可能需要新 pattern / 新 ticker"的信号,
供 curator 决策是否加入 VERIFIED 区:

1. 新 pattern 候选: 7 天内有 3+ 条新闻走 EXPLORATORY 路径且主题相似 → 标红提示
2. 新 ticker 候选: 某未入库股票在 EXPLORATORY 推荐中被 LLM 提到 3+ 次 → 提示加入
3. 已有 pattern 的 ticker 扩展: 用户反馈"相关但不在列表"的 ticker → 提示扩展

决策原则: 系统发现信号, 人决策。每次新增必须同时录入历史实例 + 跑回测才能进 VERIFIED。

---

## 2026-04-20 · Step 7 完成 · Knowledge Base Seeded

- patterns 表: 7 行
- tickers 表: 46 行
- pattern_ticker_map 表: 54 行
- historical_instances 表: 6 行 (全部为 pattern_01 的历史事件)
- Seed script: scripts/seed.ts (幂等, 可重复跑)
- 中文引号问题已在 pattern_03 和 pattern_05 修复 (全角 → 角括号)
- 下一步: Step 8 · 新闻摄入 pipeline

---

## 2026-04-20 · 模型选型决策

### 情况
账号 Tier 1, 无法调用 Opus 4.7 (需要 Tier 2 / $40+ 充值 / 7 天等待期)

### 决策
Newshock pipeline 用 Sonnet 4.5 为主, Haiku 4.5 做初筛。

### 理由
- Newshock 分类任务是结构化输出场景, Sonnet 4.5 准确率和 Opus 接近
- 成本差 5 倍: Sonnet 月 $15-25 vs Opus 月 $75-120
- $30 credits 用 Sonnet 可跑 3-4 个月, 用 Opus 2-3 周烧完
- 两阶段架构 (Haiku 初筛 + Sonnet 精细) 再降本 60%+

### 何时切 Opus
只有在 "Sonnet 分类错误率 >20%" 时才评估升级。
届时账号自动到 Tier 2, 切换无成本。
