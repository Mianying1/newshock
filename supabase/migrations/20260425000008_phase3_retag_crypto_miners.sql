-- Phase 3 · A.2 + A.3: retag 9 crypto miners that FMP mis-tagged as
-- financials/asset_mgmt, and map crypto/mining bucket to crypto_institutional_adoption
-- archetype with low weight (0.3) so miners are recall-able as adoption proxy
-- without dominating the ranking.
--
-- Apply via Supabase Dashboard SQL editor.

-- ─── A.2 · archetype_bucket_map: crypto/mining → crypto_institutional_adoption ───

INSERT INTO archetype_bucket_map (archetype_name, industry_bucket, weight, notes) VALUES
  ('crypto_institutional_adoption', 'crypto/mining', 0.3,
   'BTC mining capacity loosely correlated with institutional crypto adoption (ETF flows · BTC price)')
ON CONFLICT (archetype_name, industry_bucket) DO NOTHING;

-- ─── A.3 · Retag 9 crypto miners (single-bucket pure miners) ───

UPDATE ticker_industry_map
SET industry_buckets = ARRAY['crypto/mining'],
    primary_bucket = 'crypto/mining',
    source = 'manual_override',
    manual_override_reason = 'Mis-tagged by FMP as asset_mgmt; corrected to crypto/mining (BTC miner)',
    updated_at = now()
WHERE ticker IN ('MARA', 'RIOT', 'HUT', 'WULF', 'CIFR', 'IREN', 'BTDR', 'CLSK');

-- CORZ · dual exposure (miner + AI/HPC pivot)
UPDATE ticker_industry_map
SET industry_buckets = ARRAY['crypto/mining', 'tech/software'],
    primary_bucket = 'crypto/mining',
    source = 'manual_override',
    manual_override_reason = 'BTC miner pivoting to AI/HPC hosting (CoreWeave deal); dual exposure',
    updated_at = now()
WHERE ticker = 'CORZ';

-- ─── Post-apply verification (run separately) ───
--
-- SELECT ticker, primary_bucket, industry_buckets, source, manual_override_reason
-- FROM ticker_industry_map
-- WHERE ticker IN ('MARA','RIOT','HUT','WULF','CIFR','IREN','BTDR','CLSK','CORZ')
-- ORDER BY ticker;
--
-- SELECT count(*) AS crypto_mining_members
-- FROM ticker_industry_map
-- WHERE 'crypto/mining' = ANY(industry_buckets);
-- -- expected: 9
