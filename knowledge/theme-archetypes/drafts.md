# Newshock · 20 个主题原型 · v1 起步集合

每个原型结构:
- id: snake_case
- name: 中文名
- category
- trigger_keywords (英文, 给 Claude 识别)
- typical_beneficiaries (tier 结构)
- typical_duration
- is_active: true
- created_by: "manual_v1"
- confidence_level: "high"

注: 这是起始 20 个, 不是最终集合. 上线后通过 Pattern Discovery Loop 持续扩张.

## 地缘政治 (4 个)

### 1. middle_east_energy_shock · 中东冲突 · 油价战争溢价
- category: geopolitical
- trigger_keywords: Iran, Israel, Strait of Hormuz, oil embargo, Middle East attack
- tier 1: CVX, XOM, OXY, LNG
- tier 2: NEXT, SLB
- duration: 1-3 months

### 2. taiwan_strait_tension · 台海局势 · 半导体供应链重估
- category: geopolitical
- trigger_keywords: Taiwan, TSMC, PLA exercise, blockade, Taiwan Strait
- tier 1: INTC, GFS
- tier 2: AMAT, LRCX, LMT
- duration: 2-6 months

### 3. us_china_tariff_escalation · 美中关税升级 · 国产替代
- category: geopolitical
- trigger_keywords: tariff increase, trade war, entity list, export restriction
- tier 1: MP, AXTI
- tier 2: UUUU, INTC
- duration: 3-12 months

### 4. rare_earth_national_security · 稀土国安 · 矿业机会
- category: geopolitical
- trigger_keywords: rare earth, gallium restriction, critical minerals, REE
- tier 1: MP, UUUU
- tier 2: AXTI
- duration: 6-24 months

## 宏观货币 (3 个)

### 5. fed_dovish_pivot · Fed 鸽派转向 · 小盘 biotech / REITs
- category: macro_monetary
- trigger_keywords: Fed cut, dovish, dot plot shift, rate pivot
- tier 1: IBB, XBI, O, VICI
- duration: 3-6 months

### 6. inflation_surprise_upside · 通胀超预期 · 抗通胀资产
- category: macro_monetary
- trigger_keywords: CPI above, inflation accelerating, price surge
- tier 1: GLD, CVX, XOM
- duration: 3-9 months

### 7. dollar_strength · 美元走强 · 海外业务承压
- category: macro_monetary
- trigger_keywords: DXY surge, Fed hawkish, dollar rally
- note: 负面影响, 不推荐做空, 作为观察主题
- duration: 3-6 months

## 财报驱动 (2 个)

### 8. mega_cap_beat_raise · 大厂超预期 + 指引上修
- category: earnings
- trigger_keywords: record revenue, raises guidance, capex expansion
- tier: dynamic, 看 mega cap 是哪家
- duration: 1-3 months

### 9. smallcap_inflection · 小盘 earnings beat · read-across
- category: earnings
- trigger_keywords: beats estimates, raises guidance, accelerating growth
- filter: market_cap < $10B
- tier: dynamic, 同行业小盘
- duration: 1-3 months

## AI / 半导体 (4 个)

### 10. hyperscaler_mega_capex · Hyperscaler 超大 capex
- category: ai_semi
- trigger_keywords: gigawatt, data center buildout, multi-year compute, capex increase
- tier 1: LITE, COHR, VRT, ANET
- tier 2: AXTI, AEHR, FN, CLS
- tier 3: MU, AVGO
- duration: 3-12 months

### 11. nvda_avgo_strategic_investment · NVDA/AVGO 战略投资
- category: ai_semi
- trigger_keywords: NVIDIA invests, Broadcom partnership, strategic equity
- tier: dynamic, 被投方 + 同业 + 上游
- duration: 2-6 months

### 12. ai_model_breakthrough · 新 AI 模型突破 · 算力跳变
- category: ai_semi
- trigger_keywords: new model release, compute demand, GPU shortage
- tier 1: NVDA, AVGO, MU
- tier 2: LITE, COHR
- duration: 2-6 months

### 13. cpo_photonics_rotation · CPO 光子学轮动
- category: ai_semi
- trigger_keywords: co-packaged optics, silicon photonics, 1.6T photonics
- tier 1: LITE, COHR, AAOI
- tier 2: AXTI, SIVE, POET, FN
- duration: 6-18 months

## 供应链 (3 个)

### 14. semi_fab_disruption · Fab 事故/中断 · 替代产能
- category: supply_chain
- trigger_keywords: fab shutdown, earthquake Taiwan, semiconductor shortage
- tier 1: INTC, GFS, MU
- tier 2: AMAT, LRCX
- duration: 1-6 months

### 15. shipping_disruption · 港口/航运中断 · 运价 + 重建
- category: supply_chain
- trigger_keywords: port closure, Suez blockage, Red Sea attack
- tier 1: ZIM, DAC, STNG, DHT
- duration: 1-3 months

### 16. critical_component_shortage · 关键组件短缺 · 上游定价权
- category: supply_chain
- trigger_keywords: shortage, allocation, price hike
- tier: dynamic, 看哪个组件
- duration: 3-9 months

## 技术突破 (2 个)

### 17. new_tech_commercialization · 新技术商业化 · 前期供应链
- category: tech_breakthrough
- trigger_keywords: commercial launch, first production, mass volume
- sub-categories: CPO, 核聚变, 液冷, 量子
- tier: dynamic by tech
- duration: 6-24 months

### 18. incumbent_challenger · 老巨头失守 · 挑战者 read-across
- category: tech_breakthrough
- trigger_keywords: market share loss, rival surges, disruption
- tier: dynamic, 挑战者 + 供应商
- duration: 3-12 months

## 灾害 / 事故 (2 个)

### 19. us_hurricane · 美国飓风 · 建材 / 发电机 / 屋顶保险
- category: disaster
- trigger_keywords: hurricane Florida, hurricane Texas, landfall
- tier 1: GNRC, HD, LOW, BLDR
- tier 2: POOL, EME
- timing: 灾前 3-7 天 + 灾后 30 天
- duration: 1-2 months

### 20. cybersecurity_mass_incident · 大规模网络安全事件
- category: disaster
- trigger_keywords: ransomware, data breach, infrastructure attack
- tier 1: CRWD, PANW, FTNT, S, ZS
- duration: 1-3 months
