# Newshock Pattern Backtest Toolkit

本地跑这些文件，验证你的 7 个 event pattern 是否真的有 alpha。

## 目录结构

```
newshock/
├── backtest.py                        # 主脚本
├── patterns/
│   ├── pattern_01_groundtruth.json    # Pattern #01 - 已完成（本文档示范）
│   ├── pattern_02_...json             # 你继续做
│   ├── ...
│   └── pattern_07_...json
├── results/                            # 脚本自动生成
│   └── <pattern_id>_backtest.json
├── .env                                # 你的 API key
└── README.md
```

## Setup（一次性）

1. **Python 环境**
   ```bash
   pip install pandas requests python-dotenv
   ```

2. **FMP API key**
   - 注册 https://site.financialmodelingprep.com/developer
   - Free tier (250 req/day) 够跑 1-2 个 pattern
   - **推荐直接订 Starter $30/mo**，有全部历史数据，省事
   - 建好的 key 放 `.env`：
     ```
     FMP_API_KEY=你的key
     ```

3. **测试 Pattern #01**
   ```bash
   python backtest.py pattern_01_groundtruth
   ```

## Pattern JSON 格式

每个 pattern 文件（见 `pattern_01_groundtruth.json` 作为模板）必须包含：

```json
{
  "pattern_id": "snake_case_id",
  "pattern_name": "人类可读的名字",
  "instances": [
    {
      "event_id": "unique_id",
      "event_date": "YYYY-MM-DD",
      "event_name": "...",
      "tier_1_reactions": {
        "TICKER1": {"note": "为什么这只在 tier 1"},
        "TICKER2": {"note": "..."}
      },
      "tier_2_reactions": {
        "UPSTREAM1": {"note": "..."}
      }
    }
  ]
}
```

**关键：** 你只需要提供 `event_date` 和每个 tier 的 ticker 列表。脚本会自动拉股价数据、算 T+1/T+5/T+30 收益、算 vs SPY 的 alpha。

## 验证标准

一个 pattern 被标记为 `PASS` 的条件：
- Tier 1 T+5 胜率 ≥ 60%
- Tier 1 T+5 平均 alpha（vs SPY）≥ +2%
- 样本量 ≥ 5 次历史事件

未达标 = `FAIL`，需要：
- 调整 trigger 让它更精确
- 调整 tier 列表
- 或者 pattern 根本没 alpha，扔掉

## 输出示例

```
======================================================================
Backtesting: Hyperscaler Mega Capex Deal
Pattern ID : hyperscaler_mega_capex
Instances  : 6
======================================================================

Tier 1 tickers: ['AMZN', 'CLS', 'COHR', 'ETN', 'LITE', 'META', 'ORCL', 'VRT']
Tier 2 tickers: ['AEHR', 'ANET', 'AXTI', 'FN', 'MU', 'NEE']

  · 2025-01-21  Stargate Project Announcement ($500B)
  · 2025-09-10  Oracle-OpenAI $300B five-year compute deal
  · 2025-09-23  Stargate 5 new US data center sites (7GW total)
  ...

──────────────────────────────────────────────────────────────────────
AGGREGATE RESULTS
──────────────────────────────────────────────────────────────────────

  TIER_1:
    t1:  n= 24  win=83%  avg α=+3.12%  med=+2.80%  best=+12.3%  worst=-1.2%
    t5:  n= 24  win=79%  avg α=+5.82%  med=+5.10%  best=+22.1%  worst=-2.1%
    t30: n= 24  win=75%  avg α=+9.20%  med=+7.80%  best=+45.2%  worst=-4.8%

  TIER_2:
    t1:  n= 14  win=71%  avg α=+2.45%
    t5:  n= 14  win=79%  avg α=+6.10%
    t30: n= 14  win=86%  avg α=+18.30%  ← upstream asymmetry

======================================================================
VERDICT: PASS
======================================================================
```

## 下一步

Pattern #01 跑完 PASS 之后，对剩下 6 个 pattern 重复：

1. 手工收集 5-8 个历史 instance（用 Claude 网页版帮你找）
2. 按同样 JSON 格式存到 `patterns/pattern_0X.json`
3. `python backtest.py pattern_0X`
4. PASS 的进产品，FAIL 的调整或扔掉

**所有 PASS 的 pattern 才是你产品 v1 真正的 knowledge base。**
