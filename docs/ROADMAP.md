# Newshock · Roadmap

融合 12 条 AI 工程架构原则 · Day 3 (2026-04-22) 制定.

---

## 核心原则

- Archetype = Schema (稳定, 少)
- Theme = Instance (当前市场叙事实例)
- Event = Input (新闻流动)
- Playbook = Retrieval (检索, 非生成)
- LLM = Interpreter (解释, 非裁判)
- 图谱 = Constraint (约束 LLM 关系推理)
- 人工 = Gate (4 个关键点)
- 评分 = Decomposable (可分解可审计)

---

## 当前进度

已实现约 61% (Phase 1 完成).

当前 Phase: Phase 2 · Coverage Audit (进行中).

---

## Roadmap

### Phase 2 · Coverage Audit (Day 3 · 完成中)

对应原则: 2 (主题是判出来的), 7 (人工 gate), 12 (升格问题).

目标: AI 自审 archetype 库, 发现缺失 umbrella.

产出:
- coverage_audit_reports schema migration
- lib/coverage-audit.ts · 3 视角 prompt (umbrella/counter/merger)
- app/api/cron/coverage-audit/route.ts · 周一 16:00 UTC
- app/admin/coverage-audit/page.tsx · approve UI
- spawnThemeFromArchetype 函数 (方案 Y)
- Approve flow: archetype → theme → recommendations → events 回填

### Phase 2.1 · 小而多 (Day 4 · 4-5h)

#### Task · level_of_impact 字段 (30 min)

对应原则: 3 (三层结构), 12 (事件噪音).

Schema:
  ALTER TABLE events
  ADD COLUMN level_of_impact TEXT
    CHECK (level_of_impact IN ('structure', 'subtheme', 'event_only'));

在 sonnetIdentifyTheme prompt 加分类.
UI 默认只显示 structure + subtheme.

#### Task · Haiku 成本优化 (2-3h)

对应原则: 6 (分工模型).

替换:
- Ingest classifier (Sonnet → Haiku)
- SEC 8-K parser (Sonnet → Haiku)
- Narrative generator (Sonnet → Haiku)

保留:
- Coverage Audit (Sonnet · 战略思考)
- Refine (Sonnet · 语言风格)
- Weekly scan (Sonnet · 聚类)

预期: 节省 $40-50/月.

#### Task · Weekly scan 升格 gate (1h)

对应原则: 2 (Step 5 升格判断).

加 gate 条件:
- 2+ 独立新闻源
- 24h 内 3+ events
- mentioned_tickers 集中 (非散弹)
- 不重复已有 archetype

---

### Phase 3 · Cross-Theme View (Day 5 · 6-8h)

对应原则: 5 (图谱约束 · 初步).

目标: 解决 ALB 多主题关联问题.

Schema:
  ALTER TABLE tickers
  ADD COLUMN cross_theme_summary JSONB,
  ADD COLUMN net_position TEXT,
  ADD COLUMN convergence_score INT;

Pipeline:
- 对每 ticker 聚合 active themes
- 计算 net position (bullish/bearish/mixed/neutral)
- 计算 convergence score (3+ 同向 = high)

UI:
- /tickers/[symbol] 新 "Cross-Theme View" section
- Net position badge
- Convergence warning

---

### Phase 4 · Conviction Score (Day 6 · 6-8h)

对应原则: 9 (评分可分解).

Schema:
  ALTER TABLE themes
  ADD COLUMN conviction_score NUMERIC(3,1),
  ADD COLUMN conviction_breakdown JSONB,
  ADD COLUMN conviction_reasoning TEXT;

Breakdown JSONB:
  - historical_fit (0-10)
  - evidence_strength (0-10)
  - priced_in_risk (0-10, 反向)
  - exit_signal_distance (0-10)

Ticker 分数分解:
  ALTER TABLE theme_recommendations
  ADD COLUMN score_breakdown JSONB;

  {
    directness, purity, sensitivity,
    crowding_penalty, mega_cap_penalty
  }

UI:
- ThemeCard ★★★★☆ 星级
- 详情页 4 维条形图
- Tooltip 显示 reasoning

---

### Phase 5 · Counter Evidence + Case Library (Day 7 · 7h)

对应原则: 3 (三层结构), 4 (检索 > 生成).

#### 5a · Counter-Evidence (4h)

Schema:
  ALTER TABLE themes ADD COLUMN counter_thesis TEXT;
  ALTER TABLE events
  ADD COLUMN supports_or_contradicts TEXT
    CHECK (supports_or_contradicts IN ('supports', 'contradicts', 'neutral'));

UI:
- Event list 按 support/contradict 分色
- Theme 详情页 Bull vs Bear 计数

#### 5b · Historical Case Library (3h) · 重要

独立表 · Playbook 从 "LLM 生成" → "检索填空":

Schema:
CREATE TABLE historical_cases (
  id UUID PRIMARY KEY,
  archetype_id UUID REFERENCES theme_archetypes(id),
  case_name TEXT,
  case_name_zh TEXT,
  start_date DATE,
  end_date DATE,
  trigger_type TEXT,
  duration_days INT,
  main_beneficiaries TEXT[],
  fade_signals JSONB,
  notes TEXT,
  notes_zh TEXT,
  data_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

人工 seed 每 archetype 3-5 cases.

Playbook 生成改为:
1. SELECT 最相关 3 cases from historical_cases
2. Sonnet 聚合表达 (不自由发挥)

---

### Phase 6 · Regime Compatibility (Day 8 · 4-5h)

对应原则: 6 (分工), 12 (结构化回答).

Schema:
  ALTER TABLE theme_archetypes
  ADD COLUMN regime_preference JSONB;

  {
    thriving: ['risk_on', 'inflation'],
    struggling: ['risk_off'],
    neutral: ['mixed']
  }

UI:
- Theme 卡片按 regime 显示 ✓ 或 ⚠
- "当前 Risk Off · AI Capex 可能 struggling" 提示

---

### Phase 7 · Ticker 图谱 (Day 9-11 · 20-24h)

对应原则: 5 完整实现. **核心护城河**.

Schema:
CREATE TABLE ticker_archetype_fit (
  ticker_symbol TEXT,
  archetype_id UUID,
  fit_score NUMERIC(3,1),
  exposure_label TEXT,
  relationship_type TEXT,
  evidence_summary TEXT,
  last_updated TIMESTAMPTZ,
  PRIMARY KEY (ticker_symbol, archetype_id)
);

CREATE TABLE ticker_tags (
  ticker_symbol TEXT,
  tag_type TEXT,
  tag_value TEXT,
  confidence NUMERIC,
  PRIMARY KEY (ticker_symbol, tag_type, tag_value)
);

Pipeline:
1. AI 对每 archetype 提 30-50 ticker 候选
2. FMP 验证存在 + market cap > $1B
3. Sonnet 对每 ticker × archetype 打 fit_score
4. Human review 前 10 (人工 gate)
5. 主题生成 · 从 ticker_archetype_fit 取 top 15
   LLM 只做排序 + 解释 · 不凭空生

效果:
- ALB 真实多主题关联
- LMT 不再泛映射 14 个主题
- 关系稳定 · 不随 LLM 调用漂

---

### Phase 8 · Curator Rationale + 验证 (Day 12 · 3-4h)

对应原则: 6 (强模型).

可选:
- 高 conviction theme 加 Opus curator rationale
- 增加产品差异化

验证:
- ALB 多主题关联测试
- 银行股 coverage 测试
- Conviction 数据准确
- Cross-theme UI 渲染

---

### Phase 9 · 商业化准备 (Day 13+)

**前提: Phase 2-8 全部完成**.

- Landing page + Manifesto
- Stripe integration
- Disclaimer
- Terms / Privacy
- Twitter / Newsletter
- Product Hunt launch

---

## 与 12 原则对齐度预测

| Milestone | 对齐度 |
|-----------|--------|
| Day 3 (Phase 2 完成) | 61% → 65% |
| Day 4 (level/haiku/gate) | 65% → 75% |
| Day 5 (Phase 3) | 75% → 80% |
| Day 6 (Phase 4) | 80% → 85% |
| Day 7 (Phase 5) | 85% → 90% |
| Day 8 (Phase 6) | 90% → 92% |
| Day 9-11 (Phase 7) | 92% → 97% |
| Day 12 (Phase 8) | 97% → 98% |

12 天后: Newshock 是 production-grade AI product.

---

## 12 原则简表

1. 4 种对象分清 (Archetype/Theme/Event/ExposureMap)
2. 主题是判出来的 (不是写出来的)
3. 三层结构 + level_of_impact
4. Playbook 是检索填空 (不是生成)
5. Exposure mapping 两层引擎 (图谱约束 + 主题过滤)
6. 分工模型 (便宜/中/强模型各司其职)
7. 人工只卡 4 个点
8. 数据库分表 (events, archetypes, themes, cases, exposures)
9. 评分逻辑可分解 (strength, conviction, ticker score)
10. 产品内容去交易化 (framework 语言)
11. LLM 是解释器 (不是裁判)
12. 稳定回答三问: 强化什么结构 / 是否升格 / 直接暴露是谁

---

## 不变量 (Non-Negotiables)

- 不做投资建议. 永远是"信息工具".
- 不提前做商业化. 产品质量 > 增长速度.
- 不追赶 Phase. Phase N 做扎实再 Phase N+1.
- 不放弃双语 (EN + ZH).
- 不妥协克制语言 (framework > conclusion).
- Curator signature 是核心差异化 · 保持可见.

---

## 变更记录

- 2026-04-22 · Day 3 · 初版基于 Phase 1 完成 + 12 原则制定.
