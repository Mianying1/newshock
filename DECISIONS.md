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

## 2026-04-20 · Step 8c 完成 + 产品洞察

### 分类结果 (25 条非 SEC 样本)
- Classified 8/25 = 32% (100% 准确)
- Exploratory 11/25 = 44%
- Irrelevant 6/25 = 24%
- 成本 $0.012/条, 月 ~$35

### 关键洞察 1: Pattern #08 候选 · Strategic Partnership
Sivers-Jabil 合作被拒分类, 理由"缺 deal size"。
但这种"光子学供应链战略合作"(无 deal size) 是 Serenity 式 alpha 信号。

TODO (不在 v1, 在 v1.1): 增加 Pattern #08:
- id: strategic_partnership_design_in
- 无 min_deal_size 要求
- 关键词: "designed-in", "strategic partnership", "supply agreement"
- 上游光子学 (LITE/COHR/AXTI/SIVE) 为 tier 1

### 关键洞察 2: Google News 关键词不均衡
"chip export" 关键词过强, 导致 Pattern #03 占 75% 命中。
Step 8e cron 部署前要把单个 Google News 源
拆成 7 个 pattern 专属源。

每个 pattern 的 Google News URL 关键词:
- #01: "gigawatt" OR "data center buildout" OR "$X billion capex"
- #02: NVIDIA OR Broadcom "invests" OR "partners with"
- #03: "chip export" OR "entity list" OR "sanctions semiconductor"
- #04: "beats estimates" OR "raises guidance" small cap
- #05: "to acquire" OR "definitive agreement" semiconductor OR energy
- #06: "military strike" OR "sanctions" OR Iran OR Taiwan
- #07: hurricane OR earthquake OR "fab shutdown"

### 关键洞察 3: Exploratory 的产品价值
11 条 exploratory 是诚实过滤的体现,
Step 10 UI 要明确分层: 今日 N 条 classified (首屏)
+ M 条 exploratory (二级页面),
让用户感受到 Newshock 的"信息密度控制"价值。

---

## 2026-04-20 · Step 8c 完成 · Classifier 部署

### 结果 (25 条非 SEC events 样本)
- Classified (匹配 pattern): 8/25 = 32%
- Exploratory (相关但无 pattern): 11/25 = 44%
- Irrelevant (被 Haiku 过滤): 6/25 = 24%
- 成本: $0.012/条, 预计 $30-40/月

### Pattern 分布不均
- us_china_semi_export_control: 6/8
- war_geopolitical_escalation: 1/8
- hyperscaler_mega_capex: 1/8
- 其他 4 个 pattern: 0/8

原因: Google News 关键词偏向 "chip export", 需要在 Step 8e cron 部署前
按 pattern 配置差异化 RSS 搜索源。

### 新增概念
- tickers.is_recommendation_candidate 字段
- Mega cap (NVDA/GOOGL/MSFT 等) 作为"参考 ticker"存库但不推荐
- tickers 表现 52 行 (46 推荐候选 + 8 参考 mega cap / TSEM 不推荐)

### 分类质量观察
- hyperscaler_mega_capex 命中: Anthropic+Amazon $100B deal (confidence: 0.95) ✓
- us_china_semi_export_control 6 条命中均准确, 无误报
- war_geopolitical_escalation: Iran crisis (confidence: 0.85) ✓
- Exploratory 合理: $21M seed round 被正确拒绝 (未达 pattern 阈值), TSEM +31% 扩产未触发 pattern ✓
- Irrelevant 合理: FT 政治新闻 (Trump cabinet, Fed) 全被 Haiku 过滤 ✓

### 下一步
- Step 8d: Score 算法
- Step 8e: 差异化 RSS 源 + Vercel Cron 部署

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

---

## 2026-04-20 · 产品方向最终锁定 · v1 Theme Radar

### v1 定位

一句话: 基于新闻扫描全市场投资主题, 推荐候选股票梯队, 广覆盖不漏机会.

### v1 做什么

1. 主题发现 (Hybrid: 20 起始原型 + Claude 动态识别)
2. 候选股票梯队 (tier 1/2/3 结构)
3. 分层展示:
   - 默认首页: 高置信度主题 (5-15 个活跃)
   - 探索模式: 包含 exploratory 主题 (30-50 个)

### v1 不做

❌ 技术指标 (RSI / 均线)
❌ Setup 标签 (强势股回撤等)
❌ 股价数据 (无 FMP 依赖)
❌ 预测未来
❌ 投资建议
❌ 持仓管理

### v2 扩展 (发布后根据反馈)

- 集成 FMP 股价 API
- 3 种 setup 标签
- 历史可比精确数字

### 核心护城河: Pattern Discovery Loop

原型库持续扩张:
- v1 上线: 20 个
- 3 个月: 40 个
- 1 年: 100 个
- 长期: 200+ 个

扩张机制: Claude exploratory → 每周人工 review → 确认升级

### 合规

Publisher/Information tool.
每页免责: "信息展示, 非投资建议"

### 技术影响 (vs 之前 pattern 版本)

保留 (80%):
- Supabase 8 表 (字段语义调整)
- RSS 摄入 pipeline
- Claude 分类器 (升级为主题识别)
- 54 个 ticker

弃用:
- pattern_ticker_map 表 (v1 不用)
- Pattern #01-#07 定义 (保留文件, 不入库)
- Score 算法 (v2 再考虑)

新增:
- themes 表 (动态活跃主题)
- theme_archetypes 表 (20 原型起步, 持续扩张)
- theme_recommendations 表
- events.trigger_theme_id 字段

---

## 2026-04-20 · Pattern Discovery Loop 第一批 exploratory (待审)

A4.5 首次运转发现 7 个 exploratory theme, 其中前 3 个值得认真评估
是否升级为新 archetype:

### 优先评估 (可能成为新 archetype)
1. **Blue Origin Grounding · Space Launch Delay** (conf=72)
   - 逻辑: 商业航天事故 → 竞对优势
   - 可能 archetype: commercial_space_disruption
   - 潜在受益: SpaceX-related (未上市), RKLB (Rocket Lab)
   - 决策: 样本太少, 观察 3 个月

2. **Arm AI Data Center CPU · 架构竞争** (conf=72)
   - 逻辑: ARM 挑战 x86, CPU 架构范式级转移
   - 可能 archetype: cpu_architecture_shift
   - 潜在受益: ARM, NVDA (Grace), AMPR
   - 受压: INTC, AMD
   - 决策: 是重要趋势, 6 个月内评估入库

3. **Tower Semi AI Chip Expansion · Foundry Rotation** (conf=65)
   - 逻辑: 特种 foundry 在 TSMC 压力下分羹
   - 可能 archetype: specialty_foundry_rotation
   - 潜在受益: TSEM, UMC, GFS
   - 决策: 观察更多触发案例

### 事件级信号 (不需新 archetype)
4. Fed Leadership Transition (政策不确定性)
5. AI Deflation Thesis (分析师宏观观点)
6. Jabil AI Data Center (待观察 conf=45)
7. AI DC Boom · Semiconductor Equipment (分析师升级)

### 下一步
进 A5 前不急于扩 archetype, 先让系统跑 2-3 周积累更多 exploratory
数据, 再基于多个信号决定升级.

---

## 2026-04-20 · A5 端到端测试通过 + theme 合并问题发现

### 通过项
- 47 events 100% 分类 (无遗漏)
- 13 themes (6 active + 7 exploratory)
- 85 recommendations
- 零孤儿数据
- Theme strengthen 工作正常 (Allied Chip Controls 累积 7 events)

### 发现问题: 概念重复 themes
"Anthropic $100B AI Infra" 和 "AI 数据中心全光互联"
本质都是 cpo_photonics_rotation 触发的同一主题, 但被分别建立.

原因: Sonnet 在 batch 内见到第二条时, 已有 theme 的 summary
和新闻具体角度差异较大 (一个聚焦投资金额, 一个聚焦技术) →
判断为不同主题.

### 决策
v1: 接受这个限制 (13 个主题中 1-2 个重复完全 OK)
v2 backlog: 加 theme deduplication 机制
- 每周 cron 跑 Claude 审计 active themes
- 提议合并候选, 人工 confirm
- 不在 v1 范围

---

## 2026-04-20 · A6 review · 已记录 backlog

### v1.5 优化项

#### 1. Awareness 算法 (目前所有 themes 都是 'early')
当前: institutional_awareness 字段是 placeholder, 永远是 'early'
未来: 基于以下维度计算
- 主题在新闻流中的提及频率 (over time)
- 主流财经媒体覆盖比例 (FT/WSJ vs 小众)
- 分析师 upgrade 数量
- 期权 IV 变化
v1: 前端 UI 不强调 awareness, 用 strength 和 event_count 作为主指标

#### 2. 默认模式 vs 探索模式 recommendations 差异
默认模式 46 recs, 探索模式 85 recs (差 39 条)
原因: exploratory themes 的 recommendations 不在默认模式显示
v1: 前端展示时小字标注 "explore 模式可见更多"
v2: 考虑加 quality score 维度, 让高质量 exploratory recs 也进默认

### 已修 (commit 在 A6 中)
- Mega cap 投资方误进 tier 1 (EdgeCortix 案例)
  修复: Sonnet prompt 加 MEGA CAP INVESTOR EXCLUSION RULE
  结果: EdgeCortix 重分类为 exploratory (conf=45), tier1=GFS, tier2=AXTI

### 已修 (A6 二次迭代)
- BRK 从 mega cap 排除列表移除 (商业模式特殊性: BRK 投资即敞口)
- "Direct exposure" 加 few-shot 例子校准 (Apple-Globalstar vs Google Ventures)
- Commercial counterparty exception 规则加入
  - AMZN/Anthropic: AMZN 是商业供应方 (AWS $100B) → tier1 保留 ✓
  - NVDA/EdgeCortix: 纯财务投资, 无商业收入流 → tier1 排除 ✓
  验证结果:
  - Anthropic tier1 = [LITE, COHR, VRT, ANET, ETN, AMZN] ← AMZN 因商业关系保留
  - EdgeCortix tier1 = [GFS] ← 无 AMD/NVDA
  - 所有 active themes mega cap tier1 健康检查通过 (AMZN 是唯一例外且有理由)

## 2026-04-20 · 后端 V1 正式完成

### 完成清单
- Step 8 (旧编号) Pipeline 重构为 v2 主题雷达架构
- A1 文档 + 20 archetype 草稿
- A2 schema 改造 (3 新表)
- A2.5 + A3 schema 补字段 + 20 archetype 入库
- A3.5 archetype 重构 (砍 6 加 6, 最终 20 个高质量原型)
- A4 + A4.5 Theme Generator (3 步判断 + Pattern Discovery Loop)
- A5 端到端稳定性 (47 events 100% 分类, 0 孤儿)
- A6 Recommendation Builder + 3 API endpoints
- A6 二次迭代 (mega cap 排除 + commercial counterparty exception)
- Ticker Discovery Loop (自动捕获库外 ticker)
- 量子模拟测试通过 (整套机制端到端验证)

### 当前能力
- 自动从 4 个 RSS 源拉新闻
- Haiku 初筛 + Sonnet 主题识别
- 13 个真实 active themes + exploratory
- 85+ 推荐, 0 孤儿数据
- 2 套自我进化机制 (Pattern Discovery + Ticker Discovery)
- 3 个 API endpoint 给前端 ready

### 下一阶段
B 阶段 · 前端 UI (Next.js + Tailwind, 主题雷达 + 详情页)
预计 2-3 周

## 2026-04-21 Playbook v1 数据来源决策

**决策**: Layer A v1 使用 Sonnet 训练数据估算, 不等 FMP 校准.

**依据**:
- 用户价值在时间维度本身, 不在数字精度
- 明确 UI 声明 "AI 估算", 诚实度保持
- 1-2 周后 v1.5 升级精确数据

## 2026-04-21 "This Time Different" 纳入 v1

**决策**: v1 即加入结构性差异分析.

**依据**:
- 用户明确要求 "分析的, 不只是历史复述"
- 符合产品理念 "让用户自己判断"
- 措辞严格: observed/may, 不用 will/predict
- Sonnet 自声明 confidence, 低置信度 omit

## 2026-04-21 Playbook 存储: 文件 vs DB

**决策**: v1 存储在 knowledge/playbooks/*.json, 不存 DB.

**依据**:
- 无 exec_sql RPC, 无 pg 直连, 无法做 ALTER TABLE via JS client
- 文件存储 git-tracked, 易 review, 易 migrate
- v1.5 升级时可一次性 UPDATE theme_archetypes SET playbook = '...'::jsonb

## 2026-04-22 Phase 2 · Coverage Audit → Theme spawn (Plan Y)

**决策**: 管理员在 `/admin/coverage-audit` 点 "Create Archetype" 时，除了插入 `theme_archetypes`，同时生成一条 `themes` 行和 `theme_recommendations` 记录；并回填 `covers_unmatched_events` 里 `trigger_theme_id IS NULL` 的事件。

**实现**:
- 新函数 `spawnThemeFromArchetype(archetypeId, spec, reportId?)` 位于 `lib/archetype-pipeline.ts`
- POST `/api/admin/archetypes` 增加 `spawn_theme` payload，插档后自动调用 spawn
- `themes` 表新增 `source TEXT DEFAULT 'sonnet_classifier'` + `coverage_audit_report_id UUID REFERENCES coverage_audit_reports(id)`
- Priority → tier 映射: high→1, medium→2, low→3
- Exposure direction 默认 `uncertain`（审计阶段无足够信息判断 benefits/headwind）

**依据**:
- 路径 A (管道审慎补全) 与路径 B (宽松分类器 + 事后清理) 的协同：audit 补档 + spawn theme 让新批准立刻对用户可见，而不是等下一次相关事件触发
- 不复用 `handleNewTheme`：它的契约绑定单一 eventId，不适合无 event 或多 event 场景
- Audit 产出的 archetype 可能包含 DB 外 ticker → 校验失败的 ticker 作为 `failed_tickers` 返回给 UI 提示，不写入 ticker_candidates（避免污染该表，这些是管理员提案而非分类器提案）

**测试**: 本地 tsx 脚本对 prod Supabase 跑完整 flow，6 项断言全绿（source / report_id / 4 recs / tier=1 / failed ticker 过滤 / status active），执行后清理。

## 2026-04-25 · Admin surface security hardening

**决策**: `/admin/*`, `/api/admin/*`, `/api/theme-alerts/*`, `/debug/*` 统一由 Next middleware 保护，使用 `ADMIN_SECRET` 作为短期内部访问门槛。

**实现**:
- 新增 `middleware.ts`，支持 `Authorization: Bearer`, `x-admin-secret`, `?admin_secret=...` 和 HttpOnly cookie。
- 浏览器访问可用 `?admin_secret=...` 一次性设置 12 小时 HttpOnly cookie（保存 secret 的 SHA-256 digest，不保存原文），随后同源 admin API fetch 自动携带 cookie。
- `/api/meta/overview` 改用 `events.event_date`，避免查询不存在的 `published_at` 字段导致 freshness 指标为空。
- `.gitignore` 收紧为忽略所有 `.env*`，避免异常命名 env 文件进入 git 工作区。

**依据**:
- Admin API 使用 service role 执行写入/删除，公开暴露会直接破坏数据完整性。
- 当前阶段还没有完整 Supabase Auth/role model，`ADMIN_SECRET` middleware 是最小可用防线；正式付费前仍需迁移到真实登录、角色、审计日志。

## 2026-04-26

### Backlog · Umbrella 库覆盖缺口(月内 review)
1.2 dry-run 中 LLM 对 4 个 active 候选返回 "none"，结构上不属于现有 11 个 umbrella:
- AI Risk & Governance (e.g. AI Model Security Breach · Enterprise Trust Erosion)
- Space Commerce (e.g. Space Infrastructure Commercialization · LEO & Launch)
- Climate & Resource Scarcity (e.g. Water Infrastructure Stress · Scarcity Trade)
- Consumer Stress (e.g. Low-Income Consumer Stress · Discount Retail Slowdown)

**决策**: 不今天建。等月底累计更多 "none" verdicts 后再决定建哪几个 umbrella。
**理由**: 7 天产品过度结构化风险高于覆盖缺口风险；先观察实际事件流分布再扩 umbrella 库。
