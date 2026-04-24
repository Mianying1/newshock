-- Insert 14 historical cases across 5 archetypes
-- Mianying-approved JSON · appended to playbook->'historical_cases'
-- One-shot migration · not idempotent (re-running will duplicate cases)
--
-- Uses jsonb_build_array(jsonb_build_object(...)) instead of '[{...}]'::jsonb
-- so that raw LF inside copy-pasted SQL strings cannot corrupt JSON parsing.
--
-- Distribution:
--   turnaround_profitability_inflection  +3  (META / TSLA / INTC)               4 -> 7
--   ai_capex_infrastructure              +5  (PLTR / SMCI / DELL / APP / AMZN)  4 -> 9
--   consumer_polarization                +3  (CELH / CAVA / CCL)                4 -> 7
--   pharma_innovation_super_cycle        +2  (PFE / NVAX counter-examples)      4 -> 6
--   ai_datacenter_power_demand           +1  (VRT)                              4 -> 5
--   total: +14 cases (245 -> 259)

BEGIN;

-- pre-check
SELECT id, jsonb_array_length(playbook->'historical_cases') AS case_count_before
FROM theme_archetypes
WHERE id IN (
  'turnaround_profitability_inflection',
  'ai_capex_infrastructure',
  'consumer_polarization',
  'pharma_innovation_super_cycle',
  'ai_datacenter_power_demand'
)
ORDER BY id;

-- ============================================================
-- turnaround_profitability_inflection (4 -> 7)
-- ============================================================

-- 1/14 · META
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'META Platforms 2022-2024 · Year of Efficiency Pivot',
    'peak_move', 'Stock rebounded from $88 (Nov 2022) to $542 (2024 peak), a 515% return. Key inflection point was Zuckerberg''s Feb 2023 Q4 earnings call declaring 2023 ''Year of Efficiency'', followed by 21,000 layoffs. Stock gained 76% in Q1 2023 alone as expense guidance was cut from $94-100B to $89-95B. Revenue growth returned in Q2 2023 (+23% in Q3 2023).',
    'confidence', 'high',
    'exit_trigger', 'AI capex guidance escalation in 2024 Q2 reignited spending concerns reminiscent of Reality Labs era. Operating margin expansion plateaued. Valuation normalized to historical multiples.',
    'approximate_duration', '18-24 months'
  ))
)
WHERE id = 'turnaround_profitability_inflection';

-- 2/14 · TSLA
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Tesla 2019-2021 · Profitability + Narrative Reframe',
    'peak_move', 'Stock surged from $13 (Oct 2019 low) to $414 (Nov 2021 peak), approximately 3,000%. Catalyst sequence: Q3 2019 first-ever profitability, Battery Day Sept 2020, S&P 500 inclusion Dec 2020, COVID QE liquidity. Valuation multiple expanded from auto sector P/E 15 to tech P/S 20.',
    'confidence', 'high',
    'exit_trigger', 'Fed hawkish pivot Nov 2021, 2022 Q1 delivery miss, rate hike cycle compressed growth stock multiples resulting in 65% drawdown by end of 2022.',
    'approximate_duration', '24-30 months'
  ))
)
WHERE id = 'turnaround_profitability_inflection';

-- 3/14 · INTC
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Intel 2025-2026 · New CEO + Government Backing + 18A Breakthrough',
    'peak_move', 'Stock surged from $18 (April 2025 low) to $78 (April 2026), a 330% rally in one year reaching 26-year highs. Catalyst sequence: Lip-Bu Tan appointed CEO (March 2025), Trump administration semiconductor sovereignty policy, 18A process high-volume manufacturing (Jan 2026), Apollo $14.2B Ireland fab buyback, NVDA $5B investment, Terafab partnership with Musk/xAI, Google hyperscaler deal. Q1 2026 EPS beat consensus by 29x.',
    'confidence', 'high',
    'exit_trigger', 'RSI 78 overbought · forward P/E 128x signals extreme valuation. Watch for any 18A yield issues or foundry customer commitment delays. If Q2 2026 server CPU ramp disappoints, could see sharp correction.',
    'approximate_duration', '12-18 months'
  ))
)
WHERE id = 'turnaround_profitability_inflection';

-- ============================================================
-- ai_capex_infrastructure (4 -> 9)
-- ============================================================

-- 4/14 · PLTR
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Palantir 2022-2025 · AIP + GAAP Profitability + Index Inclusion',
    'peak_move', 'Stock surged from $5.92 (Dec 2022 low) to $220 (2025 peak), approximately 3,615% return (37x). Catalyst sequence: first-ever GAAP profitability Q4 2022 (Feb 2023), AIP platform launch April 2023, Bootcamp strategy with 75% conversion rate, +31% one-day move Feb 2024 post-Q4 2023 earnings, S&P 500 inclusion Sept 2024, Nasdaq-100 inclusion Dec 2024. U.S. commercial revenue +137% YoY in 2025.',
    'confidence', 'high',
    'exit_trigger', 'Forward P/S reached 100x+ (historical extreme). Government contract cyclicality concerns. Widening gap between valuation and analyst consensus price targets.',
    'approximate_duration', '30-36 months'
  ))
)
WHERE id = 'ai_capex_infrastructure';

-- 5/14 · SMCI
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Super Micro Computer 2023-2024 · NVDA First-Choice OEM',
    'peak_move', 'Stock surged from $7 (Dec 2022) to $118 (March 2024 peak), approximately 1,585% return. Key catalysts: first-to-market with NVDA H100 servers end of 2022, data center revenue tripling through 2023, S&P 500 inclusion March 2024. Gross margin peaked at 18%+ during Hopper launch window.',
    'confidence', 'high',
    'exit_trigger', 'Hindenburg short report August 2024 alleging accounting manipulation · Ernst & Young auditor resignation October 2024. Small-cap + governance opacity signals triggered immediate exit. Valuation never fully recovered despite new auditor verification.',
    'approximate_duration', '15-18 months'
  ))
)
WHERE id = 'ai_capex_infrastructure';

-- 6/14 · DELL
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Dell Technologies 2023-2024 · AI Server Backlog Surge',
    'peak_move', 'Stock surged from $40 (Jan 2023) to $174 (May 2024 peak), approximately 335% return. Catalyst sequence: AI-optimized server launch Q2 2023, AI server backlog doubled to $2.9B (Q4 FY24, Feb 2024), Jensen Huang public endorsement at NVDA GTC March 2024, Morgan Stanley upgrade to $152 May 2024. Tier-2 CSP and enterprise customer expansion.',
    'confidence', 'high',
    'exit_trigger', 'AI server gross margin concerns post-May 2024 peak led to pullback toward $100. Customer concentration risk in hyperscalers. Memory chip price inflation pressure on margins.',
    'approximate_duration', '15-17 months'
  ))
)
WHERE id = 'ai_capex_infrastructure';

-- 7/14 · APP
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'AppLovin 2022-2024 · AXON AI Advertising Algorithm',
    'peak_move', 'Stock surged from $10 (Dec 2022 low) to $400+ (Dec 2024), approximately 4,000% return (40x). Catalyst sequence: bear market bottom $10, AXON 2.0 AI engine launch 2023, mobile gaming ad market share dominance, Q4 2024 first significant e-commerce advertising penetration, S&P 500 inclusion Dec 2024. Revenue +77% YoY with 81% adjusted EBITDA margin.',
    'confidence', 'high',
    'exit_trigger', 'Forward P/E 48x vs industry 27x signals premium pricing. E-commerce expansion execution risk. Insider selling post-inclusion.',
    'approximate_duration', '24 months'
  ))
)
WHERE id = 'ai_capex_infrastructure';

-- 8/14 · AMZN
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Amazon 2026 · AI Capex Panic Rebound (In Progress)',
    'peak_move', 'Stock dropped 20% from peak after Feb 2026 Q4 2025 earnings announced $200B AI capex plan · 9-day decline (longest in 20 years) wiped $470B market cap. Trading at 16x operating cash flow, historical low. AWS growth at 25% (13-quarter high). Anthropic $25B investment accretive.',
    'confidence', 'medium',
    'exit_trigger', 'Watch AWS growth deceleration. AI capex ROI validation (or lack of) in next 2-3 quarters. Valuation normalizing to 25-30x OCF would signal completion of rebound.',
    'approximate_duration', '12-18 months'
  ))
)
WHERE id = 'ai_capex_infrastructure';

-- ============================================================
-- consumer_polarization (4 -> 7)
-- ============================================================

-- 9/14 · CELH
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Celsius Holdings 2019-2024 · Pepsi Distribution Deal',
    'peak_move', 'Stock surged from $1 (2019) to $99 (March 2024 peak), approximately 9,800% return. Catalyst sequence: COVID-era fitness boom, PepsiCo $550M investment + exclusive distribution deal August 2022 (key inflection), 95% US store coverage achieved 2022-2023, U.S. energy drink market share reached 11% by August 2024.',
    'confidence', 'high',
    'exit_trigger', 'September 2024 Barclays conference PepsiCo disclosed Q3 orders $100-120M below prior year (channel inventory destocking). Stock fell 70% from peak. Growth rate deceleration from triple digits. Monster Beverage competitive response.',
    'approximate_duration', '48-60 months'
  ))
)
WHERE id = 'consumer_polarization';

-- 10/14 · CAVA
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'CAVA Group 2023-2024 · Mediterranean Fast-Casual Breakout',
    'peak_move', 'IPO June 2023 at $22 closed first day +117% at $43, surged to $170 by November 2024, approximately 300% return in 18 months. Catalyst sequence: IPO priced above range, same-store sales +28.4% Q2 2023, first GAAP profitability Q3 2023, same-store sales +18% for full year 2023 vs Chipotle +8%. Growth from 263 stores (2023) targeting 1,000 by 2032.',
    'confidence', 'high',
    'exit_trigger', 'Forward P/E 243x signals extreme valuation. Revenue per location ratio ($46M) far exceeded Chipotle comparable ($4M at same stage). Expansion execution risk as store count scales.',
    'approximate_duration', '15-18 months'
  ))
)
WHERE id = 'consumer_polarization';

-- 11/14 · CCL
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Carnival 2020-2021 · Pandemic Reopening Play',
    'peak_move', 'Stock surged from $8 (April 2020 low) to $31 (June 2021 peak), approximately 290% return. Catalyst sequence: Pfizer vaccine efficacy announcement November 2020 (90%) reignited reopening trade, CDC reopening guidelines April 2021, partial cruise operations resumed June 2021. Beaten-down mega cap with extreme operational leverage.',
    'confidence', 'medium',
    'exit_trigger', 'Delta variant emergence fall 2021 + inflation concerns. Structural debt issues and share dilution from pandemic survival financing. Stock fell 60% from $31 to $12 in subsequent year. Cyclical trade with short window.',
    'approximate_duration', '12-14 months'
  ))
)
WHERE id = 'consumer_polarization';

-- ============================================================
-- pharma_innovation_super_cycle (4 -> 6)
-- ============================================================

-- 12/14 · PFE (counter-example)
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Pfizer 2020-2022 · COVID Vaccine Mega Cap Underperformance (Counter-example)',
    'peak_move', 'Stock rose modestly from $30 (March 2020) to $61 (Dec 2021 peak), approximately 100% return despite $80B+ in Comirnaty sales. Then declined 30% as one-off revenue recognition played out. Five-year return -32% despite being primary vaccine developer. Lesson: mega cap pharma captured fraction of upside vs small biotech (MRNA +2000%, BNTX +1150% over same period).',
    'confidence', 'high',
    'exit_trigger', 'Year-end 2021 at approximate peak. Single-event pandemic catalyst treated as non-repeating by market. Paxlovid sales disappointed post-approval.',
    'approximate_duration', '20-22 months'
  ))
)
WHERE id = 'pharma_innovation_super_cycle';

-- 13/14 · NVAX (counter-example)
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Novavax 2020 · Follower Trap in Pandemic Rally (Counter-example)',
    'peak_move', 'Stock surged from $5 (Jan 2020) to $157 (Dec 2020 peak), approximately 2,700% peak return. Retail-driven rally based on expectation that Novavax would join Pfizer/Moderna as fourth approved COVID vaccine. Phase 3 trial launches and EUA anticipation drove FOMO buying.',
    'confidence', 'high',
    'exit_trigger', 'FDA approval repeatedly delayed through 2021. Vaccine efficacy lower than mRNA competitors. Stock collapsed back to $5 by 2022 · retail investors suffered major losses. Classic follower-trap: when a theme takes off, market searches for laggards to catch up, but N-th entrant usually fails to execute or capture share.',
    'approximate_duration', '12 months peak, 24-30 months full round-trip'
  ))
)
WHERE id = 'pharma_innovation_super_cycle';

-- ============================================================
-- ai_datacenter_power_demand (4 -> 5)
-- ============================================================

-- 14/14 · VRT
UPDATE theme_archetypes
SET playbook = jsonb_set(
  playbook,
  '{historical_cases}',
  (playbook->'historical_cases') || jsonb_build_array(jsonb_build_object(
    'name', 'Vertiv 2023-2025 · Data Center Liquid Cooling Picks-and-Shovels',
    'peak_move', 'Stock surged from $15 (April 2023) to $165 (2025), approximately 1,100% return. Catalyst sequence: AI data center theme confirmation via NVDA rally Q1 2023, management pivot to AI data center focus Q2 2023 earnings call, CoolTera liquid cooling acquisition Dec 2023, order backlog +252% as GPU rack density jumped from 10-15kW to 120-150kW, NVDA co-engineering partnership for Rubin Ultra platform. Three-year TSR above 1,100%.',
    'confidence', 'high',
    'exit_trigger', 'Forward P/E 35x and data center capex peak-of-cycle concerns. Backlog-to-revenue ratio (1.4x book-to-bill) dependency on sustained hyperscaler spending. AI capex financing concerns introduced choppy price action late 2025.',
    'approximate_duration', '24-30 months'
  ))
)
WHERE id = 'ai_datacenter_power_demand';

-- ============================================================
-- post-check · expected counts:
--   ai_capex_infrastructure               | 9
--   ai_datacenter_power_demand            | 5
--   consumer_polarization                 | 7
--   pharma_innovation_super_cycle         | 6
--   turnaround_profitability_inflection   | 7
-- ============================================================

SELECT id, jsonb_array_length(playbook->'historical_cases') AS case_count_after
FROM theme_archetypes
WHERE id IN (
  'turnaround_profitability_inflection',
  'ai_capex_infrastructure',
  'consumer_polarization',
  'pharma_innovation_super_cycle',
  'ai_datacenter_power_demand'
)
ORDER BY id;

COMMIT;
