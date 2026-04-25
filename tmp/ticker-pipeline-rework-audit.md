# Ticker Pipeline Rework · Production Backfill Audit · 2026-04-25

Subtask 20.5 · Applied new pipeline (sector check · evidence requirement · recency weighting · Pass 2 self-consistency) to all themes with an archetype.

## Aggregate stats

- Themes processed: 48 (ok=48 · failed=0)
- Old recs total:   412
- New recs total:   375 (Δ -37)
- Pass 2 KEEP:      183
- Pass 2 REVISE:    192
- Pass 2 REMOVE:    167
- Sector skips:     27
- No-evidence:      11
- Hallucinated IDs: 21
- LLM cost:         $5.7113
- Wall time:        44.3 min

## Anomalies (>= 90% rec drop)

- (none)

## Failed themes

- (none)

## Per-theme summary

| Theme | Old | New | Added | Removed | Sector | NoEv | Halluc | P2 K/R/X | Cost |
|-------|-----|-----|-------|---------|--------|------|--------|----------|------|
| AI Capex & Infrastructure Build-out | 12 | 11 | 3 | 4 | 1 | 0 | 0 | 7/4/0 | $0.1214 |
| AI Data Center Optical Interconnect · 5-Year Transition | 11 | 7 | 2 | 5 | 0 | 0 | 0 | 3/4/3 | $0.1222 |
| AI Data Center Power · Semiconductor Efficiency | 12 | 4 | 1 | 3 | 1 | 0 | 0 | 2/2/6 | $0.1206 |
| Allied Chip Export Controls · China Localization | 12 | 8 | 0 | 2 | 1 | 0 | 0 | 4/4/2 | $0.1241 |
| Anthropic-Amazon $100B AI Deal · Compute Infrastructure | 12 | 9 | 1 | 4 | 0 | 0 | 0 | 7/2/0 | $0.1171 |
| Cell Therapy Manufacturing Automation · iPS Cost Breakthrough | 12 | 10 | 0 | 2 | 0 | 0 | 0 | 4/6/2 | $0.1217 |
| China Industrial Overcapacity Export Surge | 4 | 9 | 5 | 2 | 0 | 4 | 5 | 3/6/2 | $0.1166 |
| Chinese EV Price Competition · UK Market Disruption | 10 | 9 | 0 | 2 | 0 | 0 | 0 | 5/4/1 | $0.1174 |
| CHIPS Act Funding Delay · Fab Buildout Uncertainty | 5 | 10 | 5 | 2 | 1 | 0 | 0 | 5/5/2 | $0.1170 |
| Coinbase Payment License · Stablecoin Infrastructure | 12 | 4 | 0 | 1 | 0 | 0 | 0 | 1/3/7 | $0.1207 |
| Combat Rescue Helicopter Upgrade · IR Countermeasures | 10 | 7 | 0 | 1 | 0 | 0 | 0 | 5/2/4 | $0.1170 |
| Commodity Geopolitical Risk Premium | 5 | 9 | 5 | 3 | 0 | 0 | 0 | 4/5/4 | $0.1185 |
| Crypto Institutional Infrastructure | 11 | 8 | 0 | 0 | 0 | 0 | 0 | 4/4/3 | $0.1180 |
| Dollar Reversal · Iran War Premium Fade | 4 | 10 | 7 | 3 | 1 | 0 | 0 | 5/5/2 | $0.1194 |
| DRAM Allocation Shift · Auto Chip Shortage | 11 | 7 | 1 | 0 | 0 | 0 | 0 | 2/5/5 | $0.1174 |
| Energy Transition Capex Cycle | 7 | 8 | 5 | 7 | 1 | 0 | 0 | 5/3/3 | $0.1205 |
| EV Battery Arms Race · Ultra-Fast Charging | 11 | 6 | 0 | 4 | 0 | 0 | 0 | 4/2/5 | $0.1185 |
| EV Manufacturing Resilience · US Production Commitment | 14 | 7 | 2 | 11 | 1 | 0 | 0 | 4/3/4 | $0.1164 |
| Fed Rate Cycle Transition | 8 | 14 | 8 | 2 | 2 | 0 | 0 | 5/9/0 | $0.1209 |
| Fertilizer Supply Chain Disruption · Global Repricing | 12 | 9 | 0 | 1 | 0 | 0 | 0 | 4/5/2 | $0.1222 |
| Ford-China EV Partnership · US Market Entry | 11 | 3 | 0 | 3 | 0 | 0 | 0 | 1/2/9 | $0.1175 |
| GENIUS Act Implementation Delay · Banking Pushback | 4 | 9 | 5 | 2 | 0 | 0 | 0 | 5/4/2 | $0.1152 |
| Global Defense Spending Super-Cycle | 6 | 10 | 5 | 1 | 0 | 0 | 0 | 6/4/0 | $0.1219 |
| GM EV Retreat · Gas Truck Pivot | 10 | 9 | 1 | 1 | 0 | 0 | 0 | 6/3/3 | $0.1178 |
| Intel Turnaround · AI Foundry Pivot | 7 | 7 | 2 | 4 | 1 | 0 | 0 | 2/5/6 | $0.1192 |
| Iran Crisis Escalation · Oil War Premium | 9 | 7 | 1 | 0 | 0 | 6 | 15 | 1/6/3 | $0.1206 |
| Iran War Munitions Replenishment · Patriot Missile | 11 | 9 | 2 | 2 | 0 | 0 | 0 | 5/4/2 | $0.1227 |
| Japan Defense Export Liberalization · Production Ramp | 11 | 6 | 0 | 4 | 0 | 0 | 0 | 4/2/5 | $0.1169 |
| Lilly Oral GLP-1 Launch · Obesity Drug Competition | 11 | 5 | 0 | 3 | 0 | 0 | 0 | 2/3/3 | $0.1168 |
| Low-Income Consumer Stress · Discount Retail Slowdown | 10 | 8 | 1 | 3 | 0 | 0 | 0 | 4/4/6 | $0.1199 |
| Multi-Token Crypto ETF · Staking Yield Products | 4 | 5 | 2 | 6 | 1 | 0 | 0 | 4/1/7 | $0.1160 |
| NATO Readiness Acceleration · Russia Threat Timeline | 7 | 7 | 2 | 2 | 0 | 0 | 0 | 4/3/4 | $0.1168 |
| Neocloud GPU Capacity Expansion · AI Compute Buildout | 8 | 11 | 3 | 1 | 0 | 0 | 0 | 7/4/1 | $0.1182 |
| Nuclear Energy AI Datacenter Power · SMR Buildout | 7 | 10 | 4 | 1 | 2 | 0 | 0 | 6/4/2 | $0.1187 |
| NVDA $4B Photonics Lock · Optical Interconnect Capacity | 11 | 8 | 0 | 4 | 0 | 0 | 0 | 5/3/3 | $0.1172 |
| NVDA-Tower Deal · Specialty Foundry Capacity Lock | 10 | 5 | 2 | 3 | 2 | 0 | 0 | 4/1/6 | $0.1154 |
| Pharma Innovation Super-Cycle | 11 | 7 | 1 | 7 | 0 | 0 | 0 | 3/4/4 | $0.1235 |
| Rivian R2 Mass-Market Launch · Production Ramp | 5 | 5 | 1 | 6 | 0 | 0 | 0 | 1/4/7 | $0.1154 |
| Space Infrastructure Commercialization · LEO & Launch | 0 | 3 | 3 | 8 | 2 | 1 | 1 | 2/1/8 | $0.1163 |
| Taiwan Info War Escalation · Semiconductor Risk | 12 | 10 | 0 | 2 | 1 | 0 | 0 | 3/7/0 | $0.1190 |
| Trump Crypto Policy Volatility · BTC Price Swings | 9 | 7 | 1 | 3 | 3 | 0 | 0 | 4/3/4 | $0.1172 |
| UK Crypto P2P Crackdown · Regulated Exchange Flight | 2 | 5 | 3 | 9 | 1 | 0 | 0 | 3/2/9 | $0.1174 |
| US Government Intel Stake · CHIPS Act Validation | 7 | 13 | 6 | 1 | 1 | 0 | 0 | 7/6/1 | $0.1202 |
| US Rare Earth Onshoring · Magnet Manufacturing | 11 | 6 | 1 | 8 | 3 | 0 | 0 | 4/2/4 | $0.1205 |
| Utility Grid Capex · AI Datacenter Power PPA | 12 | 9 | 5 | 10 | 0 | 0 | 0 | 2/7/2 | $0.1261 |
| Water Infrastructure Stress · Scarcity Trade | 0 | 8 | 8 | 3 | 0 | 0 | 0 | 1/7/3 | $0.1183 |
| Western Critical Minerals Reshoring | 4 | 9 | 5 | 2 | 0 | 0 | 0 | 1/8/2 | $0.1205 |
| x86 CPU Supply Crunch · Intel Pricing Power | 7 | 8 | 5 | 0 | 1 | 0 | 0 | 3/5/4 | $0.1183 |

## Top 20 biggest changes (by removed + added)

- **Utility Grid Capex · AI Datacenter Power PPA** (old=12, new=9)
  - REMOVED: ETR, EXC, PWR, ETN, DUK, SO, AEP, CEG, ED, WULF
  - ADDED:   AEE, LNT, CNP, AES, EVRG
- **EV Manufacturing Resilience · US Production Commitment** (old=14, new=7)
  - REMOVED: F, RIVN, LCID, ENVX, QS, TSLA, LRCX, BYDDY, PGTI, PLUG, ROCK
  - ADDED:   NOVONIX, MP
- **Energy Transition Capex Cycle** (old=7, new=8)
  - REMOVED: SQM, NEE, GM, TSLA, MLM, STLD, CF
  - ADDED:   FCX, ENPH, AES, LNG, PLUG
- **UK Crypto P2P Crackdown · Regulated Exchange Flight** (old=2, new=5)
  - REMOVED: MARA, CLSK, COIN.L, SI, PYPL, SQ, RIOT, BTBT, CIFR
  - ADDED:   CME, ICE, CBOE
- **Space Infrastructure Commercialization · LEO & Launch** (old=0, new=3)
  - REMOVED: SPIR, KTOS, IRDM, VSAT, MAXR, PL, GILT, LMT
  - ADDED:   RKLB, ASTS, LUNR
- **Water Infrastructure Stress · Scarcity Trade** (old=0, new=8)
  - REMOVED: ARTNA, GWRS, PNNW
  - ADDED:   AWK, XYL, AWR, WTRG, SJW, CWT, MSEX, EVVTY
- **Dollar Reversal · Iran War Premium Fade** (old=4, new=10)
  - REMOVED: GLD, KLAC, HON
  - ADDED:   ASML, GOOGL, META, MSFT, AAPL, QCOM, ETN
- **Fed Rate Cycle Transition** (old=8, new=14)
  - REMOVED: NEE, BTC-USD
  - ADDED:   BAC, PHM, MS, HYG, IEF, SCHW, GS, USB
- **US Rare Earth Onshoring · Magnet Manufacturing** (old=11, new=6)
  - REMOVED: AXTI, RR.L, TMQ, 6993.T, ALB, F, GE, RTX
  - ADDED:   TSLA
- **Commodity Geopolitical Risk Premium** (old=5, new=9)
  - REMOVED: STLAP, ADM, VALE
  - ADDED:   CNQ, SLB, TTE, NTR, OXY
- **Multi-Token Crypto ETF · Staking Yield Products** (old=4, new=5)
  - REMOVED: MARA, RIOT, SQ, PYPL, CIFR, BITF
  - ADDED:   GLXY, CME
- **Pharma Innovation Super-Cycle** (old=11, new=7)
  - REMOVED: HIMS, WBA, PFE, LEGN, INCY, IONS, SWTX
  - ADDED:   DHR
- **AI Capex & Infrastructure Build-out** (old=12, new=11)
  - REMOVED: VST, HIVE, INTC, PWR
  - ADDED:   AEHR, APH, BE
- **AI Data Center Optical Interconnect · 5-Year Transition** (old=11, new=7)
  - REMOVED: AAOI, SMTC, ANET, AVGO, GLW
  - ADDED:   AEHR, TSEM
- **China Industrial Overcapacity Export Surge** (old=4, new=9)
  - REMOVED: NUE, LYB
  - ADDED:   ENPH, RUN, MT, LAC, PLL
- **CHIPS Act Funding Delay · Fab Buildout Uncertainty** (old=5, new=10)
  - REMOVED: TSM, UMC
  - ADDED:   ASML, KLAC, ENTG, ONTO, ACLS
- **GENIUS Act Implementation Delay · Banking Pushback** (old=4, new=9)
  - REMOVED: FIS, FISV
  - ADDED:   MS, JPM, BK, STT, SQ
- **Rivian R2 Mass-Market Launch · Production Ramp** (old=5, new=5)
  - REMOVED: LCID, STLA, XPEV, JOBY, NIO, PTRA
  - ADDED:   APTV
- **US Government Intel Stake · CHIPS Act Validation** (old=7, new=13)
  - REMOVED: ACM
  - ADDED:   ENTG, UCTT, MKSI, EMR, ONTO, ASML
- **Western Critical Minerals Reshoring** (old=4, new=9)
  - REMOVED: GRML, LTBR
  - ADDED:   LAC, NOVRF, PMET.TO, SMMRF, URG

## Rollback

Backup table: `theme_recommendations_backup` (created pre-backfill).
Rollback SQL stored at `/tmp/ROLLBACK.sql`.
Retain backup at least 7 days before dropping.