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
