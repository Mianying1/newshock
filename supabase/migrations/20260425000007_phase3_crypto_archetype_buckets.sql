-- Phase 3 · P1 fix: backfill missing buckets for crypto archetypes
-- Diagnosis: MSTR (primary=crypto/treasury) and CME (primary=financials/exchanges)
-- were excluded from crypto_institutional_infrastructure retrieval because the
-- archetype_bucket_map didn't include those buckets. crypto_institutional_adoption
-- already has crypto/treasury but is also missing financials/exchanges.

INSERT INTO archetype_bucket_map (archetype_name, industry_bucket, weight, notes) VALUES
  ('crypto_institutional_infrastructure', 'crypto/treasury', 0.8,
   'BTC treasury holders (MSTR) are core institutional BTC exposure infrastructure'),
  ('crypto_institutional_infrastructure', 'financials/exchanges', 0.7,
   'Traditional exchanges running crypto derivatives (CME) are key institutional crypto rails'),
  ('crypto_institutional_adoption', 'financials/exchanges', 0.7,
   'CME crypto futures/options provide regulated institutional adoption channel')
ON CONFLICT (archetype_name, industry_bucket) DO NOTHING;

-- Audit query (run separately, not part of the migration):
--   SELECT archetype_name, COUNT(*) AS bucket_count
--   FROM archetype_bucket_map
--   GROUP BY archetype_name
--   ORDER BY bucket_count ASC, archetype_name;
