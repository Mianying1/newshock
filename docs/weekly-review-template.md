# Newshock · Weekly Review Checklist

频率: 每周日 30 分钟
责任人: Mianying

## 1. Ticker Candidates Review (10 分钟)

跑 SQL:

```sql
SELECT 
  symbol, 
  mention_count, 
  first_seen_at::date as first_seen,
  contexts->-1->>'role_reasoning' as latest_reasoning,
  contexts->-1->>'theme_id' as latest_theme_id
FROM ticker_candidates
WHERE status = 'pending'
ORDER BY mention_count DESC, first_seen_at DESC;
```

对每个 candidate 做 3 选 1:

**A. 验证为真票 → 加入 tickers 表 + 标 promoted**

```sql
INSERT INTO tickers (symbol, company_name, sector, market_cap_usd_b, 
                     is_recommendation_candidate)
VALUES ('IONQ', 'IonQ Inc', 'quantum_computing', 5, true);

UPDATE ticker_candidates 
SET status = 'promoted', promoted_at = now() 
WHERE symbol = 'IONQ';
```

**B. 验证存在但暂不入库 → 标 validated**

```sql
UPDATE ticker_candidates 
SET status = 'validated', 
    validated_at = now(),
    validation_notes = '小盘风险高暂缓' 
WHERE symbol = 'XXXX';
```

**C. 拒绝 (幻觉 / ETF / 不上市) → 标 rejected**

```sql
UPDATE ticker_candidates 
SET status = 'rejected', 
    validation_notes = 'ETF不入库' 
WHERE symbol = 'XXXX';
```

---

## 2. Exploratory Themes Review (10 分钟)

跑 SQL:

```sql
SELECT id, name, summary, classification_confidence, 
       first_seen_at::date as first_seen, event_count
FROM themes
WHERE status = 'exploratory_candidate'
ORDER BY classification_confidence DESC, event_count DESC;
```

对每个 exploratory theme:

**A. 升级为正式 archetype (≥3 次同模式 exploratory)**
- 在 `knowledge/theme-archetypes/` 加新 JSON 文件
- `npx tsx scripts/seed.ts` (重新 seed)
- `UPDATE themes SET archetype_id = '新id', status = 'active' WHERE id = ...`

**B. 暂时观察 → 不动**

**C. 不靠谱 →**
```sql
UPDATE themes SET status = 'archived' WHERE id = ...
```

---

## 3. Active Themes 健康检查 (5 分钟)

```sql
SELECT name, theme_strength_score, event_count, 
       last_active_at::date as last_active,
       extract(day from now() - last_active_at) as days_quiet
FROM themes
WHERE status = 'active'
ORDER BY theme_strength_score DESC;
```

行动:
- 超过 14 天无新事件 → `UPDATE themes SET status = 'cooling_down' WHERE id = ...`
- 超过 30 天无新事件 → `UPDATE themes SET status = 'archived' WHERE id = ...`

---

## 4. 上周 Pipeline 健康度 (5 分钟)

```sql
SELECT 
  date_trunc('day', event_date)::date as day,
  count(*) as event_count,
  count(distinct trigger_theme_id) as themes_touched
FROM events
WHERE event_date > now() - interval '7 days'
GROUP BY day
ORDER BY day DESC;
```

观察:
- 日均事件数稳定吗 (正常 30–60/天)?
- 主题被触发的多样性 (正常 5–15 themes/day)?
- 异常天数 → 检查 cron / RSS 源是否中断

---

## 完成后记录

在 `DECISIONS.md` 末尾追加:

```markdown
## YYYY-MM-DD · Weekly Review #N

- Tickers promoted: [list]
- Tickers rejected: [list]
- Tickers validated (待观察): [list]
- Exploratory promoted to archetype: [list]
- Themes archived: [list]
- Pipeline 健康: 正常 / 异常 (说明)
- 决策 / 观察: ...
```
