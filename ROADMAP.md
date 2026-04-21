# Newshock · Product Development Roadmap

## 产品定位

一句话: 基于新闻扫描全市场投资主题, 推荐候选股票梯队. 广覆盖, 分层展示, 持续扩张原型库.

合规: Publisher, 非 Investment Advisor. 不预测, 不建议.

## 3 阶段开发

### 阶段 A · 后端主题引擎 (2 周)
- A1. 文档重定位 + 20 原型草稿 (1-2h)
- A2. Schema 改造 (0.5d)
- A3. 20 原型 seed (0.5d)
- A4. Theme Generator (1-1.5d)
- A5. 对 45 events 跑验证 (0.5d)
- A6. Recommendation Builder (0.5d)
- A7. Cron 部署 (0.5d)

### 阶段 B · 前端 UI (2 周)
- B1. 设计稿 + Component 规划 (1d)
- B2. 主题雷达首页 (2-3d)
- B3. 主题详情页 (1-2d)
- B4. 探索模式切换 (0.5d)
- B5. 搜索和筛选 (0.5d)
- B6. 合规 disclaimer (0.5d)

### 阶段 C · 上线准备 (2-3 周)
- C1. Supabase Auth (1d)
- C2. Stripe 订阅 (2d)
- C3. 权限分层 (1d)
- C4. 邮件 digest (1d)
- C5. 内测 (1 周)
- C6. Beta 20-50 人 (2 周)
- C7. 法律 ($700-1500, 1 周)
- C8. 公开发布 (1d)

## 时间预估

B 路径 (15-20h/周): 10-13 周, 目标 7 月底 - 8 月初发布

## 成功标准 (v1 发布后 30 天)

- 注册用户 100+
- 付费用户 5+
- 自己每天打开 ≥ 1 次
- 原型库扩张到 25+
- D7 retention ≥ 25%

## Pivot 条件 (90 天)

达到 → 继续 v2 (技术指标 + setup 标签)
达不到 → Pivot 或停止, 不是"再坚持一下"

## Playbook Feature Evolution (M1.5.6+)

### v1.0 (2026-04-21 完成)
- Sonnet 训练数据估算
- 模糊时间范围 + 置信度
- "This time different" 静态分析
- UI: 详情页 section + 主页简版
- 存储: knowledge/playbooks/*.json (文件)

### v1.5 (1-2 周后)
- FMP 历史股价校准 historical_cases
- 精确 peak duration / move 数字
- 工作量: 1-2 天

### v2.0 (1 月后)
- Web search 增强 "This time different"
- Sonnet 看最近新闻补充训练数据外的变化
- 工作量: 3-5 天

### v2.5 (2-3 月后)
- 产品内部数据接入 playbook
- 公开历史 + 站内主题 lifecycle 双重数据
- 工作量: 1-2 周

### v3.0 (半年后)
- Embedding-based 跨 archetype 相似度
- 动态查询最相似历史主题
- 工作量: 2-3 周
